import type { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../utils/prisma.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import type { AuthRequest } from "../middleware/auth.js";
import { ok, okList } from "../shared/api-response.js";
import { forbidden, notFound } from "../shared/errors.js";
import { offsetOf, pageMeta, parsePaging } from "../shared/pagination.js";
import { toAdminUserItem } from "../shared/dto-mappers.js";
import { administeredEntityIds, adminActor, adminDateRange, writeAudit } from "../shared/admin-helpers.js";
import { lockUser } from "../services/admin-moderation.js";

/**
 * User moderation (detail-project 15): list, lock and unlock. Locking ends
 * every live session and always leaves an audit row.
 */

const router = Router();

const listQuery = z
  .object({
    q: z.string().trim().max(100).optional(),
    status: z.enum(["ACTIVE", "LOCKED", "ALL"]).optional(),
    role: z.enum(["USER", "ADMIN", "ALL"]).optional(),
    handled_by: z.string().trim().min(1).max(64).optional(),
    from: z.string().optional(),
    to: z.string().optional(),
    page: z.string().optional(),
    page_size: z.string().optional(),
  })
  .strict();

// GET /api/v1/admin/users?q&status&role&page&page_size
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const query = listQuery.parse(req.query);
    const paging = parsePaging(req.query);

    const where: Prisma.UserWhereInput = {};
    const handledIds = await administeredEntityIds("user", query.handled_by);
    if (handledIds) where.id = { in: handledIds };
    if (query.q !== undefined) {
      where.OR = [
        { fullName: { contains: query.q, mode: "insensitive" } },
        { email: { contains: query.q, mode: "insensitive" } },
      ];
    }
    if (query.status !== undefined && query.status !== "ALL") where.status = query.status;
    if (query.role !== undefined && query.role !== "ALL") where.role = query.role;
    where.joinedAt = adminDateRange(query.from, query.to);

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: { joinedAt: "desc" },
        skip: offsetOf(paging),
        take: paging.page_size,
      }),
      prisma.user.count({ where }),
    ]);

    okList(
      res,
      users.map((user) => toAdminUserItem(user)),
      pageMeta(paging, total),
    );
  }),
);

// GET /api/v1/admin/users/:id
router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = req.params.id;
    const user = id === undefined ? null : await prisma.user.findUnique({ where: { id } });
    if (!user) throw notFound("Không tìm thấy người dùng này.");
    ok(res, toAdminUserItem(user));
  }),
);

const lockBody = z
  .object({ reason: z.string().trim().min(1).max(500) })
  .strict();

// POST /api/v1/admin/users/:id/lock
router.post(
  "/:id/lock",
  asyncHandler(async (req: AuthRequest, res) => {
    const actor = adminActor(req);
    const body = lockBody.parse(req.body);

    const id = req.params.id;
    const target = id === undefined ? null : await prisma.user.findUnique({ where: { id } });
    if (!target) throw notFound("Không tìm thấy người dùng này.");
    if (target.id === actor.id) throw forbidden("Không thể khóa tài khoản của chính bạn.");
    if (target.role === "ADMIN") {
      throw forbidden("Không thể khóa tài khoản quản trị viên khác.");
    }

    const locked = await prisma.$transaction(async (tx) => {
      return lockUser(tx, {
        userId: target.id,
        reason: body.reason,
        actor,
      });
    });

    ok(res, toAdminUserItem(locked));
  }),
);

// POST /api/v1/admin/users/:id/unlock
router.post(
  "/:id/unlock",
  asyncHandler(async (req: AuthRequest, res) => {
    const actor = adminActor(req);

    const unlocked = await prisma.$transaction(async (tx) => {
      const id = req.params.id;
      if (id === undefined) throw notFound("Không tìm thấy người dùng này.");
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${id} FOR UPDATE`;
      const target = await tx.user.findUnique({ where: { id } });
      if (!target) throw notFound("Không tìm thấy người dùng này.");
      const user = await tx.user.update({
        where: { id: target.id },
        data: { status: "ACTIVE", lockReason: null, lockedAt: null },
      });
      await writeAudit(tx, {
        actorId: actor.id,
        actorName: actor.fullName,
        action: "user.unlock",
        entityType: "user",
        entityId: target.id,
        reason: null,
        metadata: { status: "ACTIVE" },
      });
      return user;
    });

    ok(res, toAdminUserItem(unlocked));
  }),
);

export { router as adminUsersRouter };
