import { Router } from "express";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { AuthRequest } from "../middleware/auth.js";
import { requireActive } from "../middleware/auth.js";
import { AppError, asyncHandler } from "../middleware/errorHandler.js";
import { prisma } from "../utils/prisma.js";
import { ok } from "../shared/api-response.js";
import {
  forbidden,
  notFound,
  unauthorized,
  validationError,
} from "../shared/errors.js";
import { enqueueOutbox } from "../outbox/outbox.js";
import { publishRealtimeEvent } from "../realtime/events.js";

const router = Router();
const userId = z.string().uuid();
router.get(
  "/blocks",
  asyncHandler(async (req: AuthRequest, res) => {
    const rows = await prisma.userBlock.findMany({
      where: { blockerId: req.user!.id },
      select: { blockedId: true, blocked: { select: { fullName: true } } },
      take: 500,
    });
    ok(res, {
      user_ids: rows.map((row) => row.blockedId),
      users: rows.map((row) => ({
        id: row.blockedId,
        name: row.blocked.fullName,
      })),
    });
  }),
);
router.put(
  "/blocks/:id",
  requireActive,
  asyncHandler(async (req: AuthRequest, res) => {
    const target = userId.parse(req.params.id);
    if (target === req.user!.id)
      throw validationError("Không thể chặn chính bạn.");
    await prisma.$transaction(async (tx) => {
      const ids = [req.user!.id, target].sort();
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" IN (${ids[0]}, ${ids[1]}) ORDER BY "id" FOR UPDATE`;
      if (
        !(await tx.user.findUnique({
          where: { id: target },
          select: { id: true },
        }))
      )
        throw notFound();
      await tx.userBlock.upsert({
        where: {
          blockerId_blockedId: { blockerId: req.user!.id, blockedId: target },
        },
        create: { blockerId: req.user!.id, blockedId: target },
        update: {},
      });
    });
    ok(res, { blocked: true });
  }),
);
router.delete(
  "/blocks/:id",
  asyncHandler(async (req: AuthRequest, res) => {
    await prisma.userBlock.deleteMany({
      where: {
        blockerId: req.user!.id,
        blockedId: userId.parse(req.params.id),
      },
    });
    ok(res, { blocked: false });
  }),
);

const registration = z
  .object({
    installation_id: z.string().uuid(),
    token: z
      .string()
      .regex(/^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/),
    platform: z.enum(["android", "ios"]),
  })
  .strict();
router.put(
  "/push-registration",
  requireActive,
  asyncHandler(async (req: AuthRequest, res) => {
    const data = registration.parse(req.body);
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${req.user!.id} FOR UPDATE`;
      const session = await tx.session.findUnique({
        where: { id: req.sessionId! },
      });
      if (
        !session ||
        session.transport !== "MOBILE" ||
        session.revokedAt ||
        session.expiresAt <= new Date()
      )
        throw unauthorized();
      // Possession of a token alone cannot reassign another account's registration.
      const existing = await tx.pushRegistration.findUnique({
        where: { token: data.token },
      });
      if (
        existing &&
        (existing.userId !== req.user!.id ||
          existing.installationId !== data.installation_id)
      ) {
        const oldSession = await tx.session.findUnique({
          where: { id: existing.sessionId },
        });
        if (
          existing.enabled &&
          oldSession &&
          !oldSession.revokedAt &&
          oldSession.expiresAt > new Date()
        )
          throw forbidden(
            "Thiết bị còn gắn với một phiên khác. Hãy đăng xuất phiên đó trước.",
          );
        await tx.pushRegistration.delete({ where: { id: existing.id } });
      }
      await tx.pushRegistration.upsert({
        where: {
          userId_installationId: {
            userId: req.user!.id,
            installationId: data.installation_id,
          },
        },
        create: {
          userId: req.user!.id,
          sessionId: req.sessionId!,
          installationId: data.installation_id,
          token: data.token,
          platform: data.platform,
        },
        update: {
          sessionId: req.sessionId!,
          token: data.token,
          platform: data.platform,
          enabled: true,
        },
      });
    });
    ok(res, { registered: true });
  }),
);
router.delete(
  "/push-registration",
  asyncHandler(async (req: AuthRequest, res) => {
    await prisma.pushRegistration.updateMany({
      where: { userId: req.user!.id, sessionId: req.sessionId },
      data: { enabled: false },
    });
    ok(res, { registered: false });
  }),
);

router.post(
  "/delete-account",
  asyncHandler(async (req: AuthRequest, res) => {
    const data = z
      .object({ password: z.string().min(1).max(200) })
      .strict()
      .parse(req.body);
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) throw unauthorized();
    if (
      Buffer.byteLength(data.password, "utf8") > 72 ||
      !(await bcrypt.compare(data.password, user.passwordHash))
    )
      throw validationError("Mật khẩu không đúng.", {
        password: "Mật khẩu không đúng.",
      });
    if (user.role === "ADMIN")
      throw forbidden(
        "Tài khoản quản trị cần chuyển quyền quản trị trước khi yêu cầu xóa.",
      );
    const replacementHash = await bcrypt.hash(randomUUID(), 12);
    const now = new Date();
    await prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${user.id} FOR UPDATE`;
        const live = await tx.user.findUnique({ where: { id: user.id } });
        if (!live || live.passwordHash !== user.passwordHash)
          throw unauthorized();
        await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "buyerId" = ${user.id} OR "sellerId" = ${user.id} ORDER BY "id" FOR UPDATE`;
        await tx.$queryRaw`SELECT "id" FROM "Product" WHERE "sellerId" = ${user.id} ORDER BY "id" FOR UPDATE`;
        const active = await tx.order.count({
          where: {
            OR: [{ buyerId: user.id }, { sellerId: user.id }],
            status: { notIn: ["COMPLETED", "CANCELLED"] },
          },
        });
        const tickets = await tx.supportTicket.count({
          where: { userId: user.id, status: { in: ["OPEN", "IN_PROGRESS"] } },
        });
        if (active || tickets)
          throw new AppError(
            "ACCOUNT_DELETION_PENDING",
            "Vui lòng hoàn tất đơn hàng và yêu cầu hỗ trợ đang mở trước khi xóa tài khoản.",
            409,
          );
        const assets = await tx.uploadAsset.findMany({
          where: { userId: user.id },
          select: { id: true, storagePath: true },
        });
        for (const asset of assets)
          await enqueueOutbox(
            tx,
            "storage.delete",
            asset.id,
            `account-delete:asset:${asset.id}`,
            { storage_path: asset.storagePath },
          );
        await tx.productImage.deleteMany({
          where: { product: { sellerId: user.id } },
        });
        await tx.product.updateMany({
          where: { sellerId: user.id },
          data: {
            title: "Tin đã xóa",
            description: "Nội dung đã được xóa theo yêu cầu chủ tài khoản.",
            status: "INACTIVE",
            deletedAt: now,
            version: { increment: 1 },
          },
        });
        await tx.orderItem.updateMany({
          where: { product: { sellerId: user.id } },
          data: { imagePathSnapshot: null, imageUrl: null },
        });
        await tx.orderStatusHistory.updateMany({
          where: { actorId: user.id },
          data: { actorName: "Người dùng đã xóa" },
        });
        await tx.orderDeliveryInfo.updateMany({
          where: { order: { buyerId: user.id } },
          data: {
            recipientName: "Người dùng đã xóa",
            recipientPhone: "",
            deliveryAddress: "",
          },
        });
        await tx.message.deleteMany({ where: { senderId: user.id } });
        await tx.review.deleteMany({ where: { reviewerId: user.id } });
        await tx.report.updateMany({
          where: { reporterId: user.id },
          data: { description: null },
        });
        await tx.supportMessage.updateMany({
          where: { senderId: user.id },
          data: { message: "Nội dung đã xóa." },
        });
        await tx.supportTicket.updateMany({
          where: { userId: user.id },
          data: { subject: "Yêu cầu của tài khoản đã xóa" },
        });
        await tx.cartItem.deleteMany({ where: { userId: user.id } });
        await tx.favorite.deleteMany({ where: { userId: user.id } });
        const conversations = await tx.conversation.findMany({
          where: { OR: [{ buyerId: user.id }, { sellerId: user.id }] },
          select: { id: true },
        });
        await tx.notification.deleteMany({
          where: {
            OR: [
              { userId: user.id },
              {
                type: "NEW_MESSAGE",
                referenceId: { in: conversations.map((row) => row.id) },
              },
            ],
          },
        });
        await tx.userBlock.deleteMany({
          where: { OR: [{ blockerId: user.id }, { blockedId: user.id }] },
        });
        await tx.outboxEvent.deleteMany({
          where: {
            OR: [
              { eventType: "email.auth", aggregateId: user.id },
              {
                eventType: "message.created",
                payload: { path: ["message", "sender_id"], equals: user.id },
              },
            ],
          },
        });
        await tx.pushRegistration.deleteMany({ where: { userId: user.id } });
        await tx.uploadAsset.deleteMany({ where: { userId: user.id } });
        await tx.authToken.deleteMany({ where: { userId: user.id } });
        await tx.session.updateMany({
          where: { userId: user.id },
          data: { revokedAt: now },
        });
        await tx.auditLog.updateMany({
          where: { actorId: user.id },
          data: { metadata: {}, actorName: "Người dùng đã xóa" },
        });
        await tx.auditLog.updateMany({
          where: {
            OR: [
              { targetUserId: user.id },
              { targetProduct: { sellerId: user.id } },
            ],
          },
          data: { metadata: {} },
        });
        await tx.user.update({
          where: { id: user.id },
          data: {
            email: `deleted-${user.id}@invalid.local`,
            passwordHash: replacementHash,
            fullName: "Người dùng đã xóa",
            phone: null,
            avatarUrl: null,
            provinceCode: null,
            defaultAddress: null,
            emailVerifiedAt: null,
            emailVerificationRequestedAt: null,
            status: "LOCKED",
            deletedAt: now,
            lockReason: "ACCOUNT_DELETED",
          },
        });
        await enqueueOutbox(
          tx,
          "session.revoked",
          user.id,
          `account-delete:${user.id}`,
          { user_id: user.id },
        );
      },
      { isolationLevel: "Serializable" },
    );
    publishRealtimeEvent({
      eventType: "session.revoked",
      aggregateId: user.id,
      payload: { user_id: user.id },
    });
    ok(res, { deleted: true });
  }),
);
export { router as mobileRouter };
