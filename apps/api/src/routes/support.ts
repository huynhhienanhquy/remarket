import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import type { SupportTicket, User } from "@prisma/client";
import {
  API_ERROR_CODES,
  TICKET_STATUSES,
  TICKET_TYPES,
  validateSupportMessage,
  validateSupportSubject,
} from "@remarket/shared";
import type { SupportTicketDetail } from "@remarket/shared";
import { prisma } from "../utils/prisma.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import type { AuthRequest, AuthUser } from "../middleware/auth.js";
import { conflict, forbidden, notFound, unauthorized, validationError } from "../shared/errors.js";
import { ok, okList } from "../shared/api-response.js";
import { offsetOf, pageMeta, parsePaging } from "../shared/pagination.js";
import { toSupportTicketDetail, toSupportTicketListItem } from "../shared/dto-mappers.js";
import { lockSupportTicketWithOrder } from "../services/support-ticket-lock.js";

/**
 * Support tickets (detail-project 14.4).
 *
 * This router serves the owner only: list and detail are scoped to
 * `userId = caller`, so somebody else's ticket answers 404 instead of 403.
 * Admin list/detail/reply live under `/admin/support-tickets`.
 */

const router = Router();

function currentUser(req: AuthRequest): AuthUser {
  if (!req.user) throw unauthorized();
  return req.user;
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

async function loadOwnTicket(userId: string, ticketId: string): Promise<SupportTicket> {
  const ticket = await prisma.supportTicket.findFirst({ where: { id: ticketId, userId } });
  if (!ticket) throw notFound("Không tìm thấy yêu cầu hỗ trợ này.");
  return ticket;
}

/**
 * Detail DTO including every message so far. Senders are loaded once for the
 * distinct ids and handed to the mapper as a lookup map.
 */
async function detailOf(ticket: SupportTicket): Promise<SupportTicketDetail> {
  const messages = await prisma.supportMessage.findMany({
    where: { ticketId: ticket.id },
    orderBy: { createdAt: "asc" },
  });
  const senderIds = [...new Set(messages.map((message) => message.senderId))];
  const senders =
    senderIds.length > 0
      ? await prisma.user.findMany({ where: { id: { in: senderIds } } })
      : [];
  const senderNames = new Map<string, User>(
    senders.map((sender): [string, User] => [sender.id, sender]),
  );
  // The owner never sees admin metadata (detail-project 14.4).
  return toSupportTicketDetail(ticket, messages, senderNames, false, null);
}

/** `TK-` + 6 digits; a collision is retried a bounded number of times. */
function generateTicketCode(): string {
  const digits = Math.floor(Math.random() * 1_000_000)
    .toString()
    .padStart(6, "0");
  return `TK-${digits}`;
}

const CODE_MAX_ATTEMPTS = 5;

const listQuerySchema = z
  .object({
    status: z.enum(TICKET_STATUSES, { message: "Trạng thái không hợp lệ." }).optional(),
    type: z.enum(TICKET_TYPES, { message: "Loại yêu cầu không hợp lệ." }).optional(),
    page: z.unknown().optional(),
    page_size: z.unknown().optional(),
  })
  .strict();

const createTicketSchema = z
  .object({
    type: z.enum(TICKET_TYPES, { message: "Hãy chọn loại yêu cầu hỗ trợ." }),
    subject: z.string({ message: "Tiêu đề không được để trống." }),
    message: z.string({ message: "Nội dung không được để trống." }),
    order_id: z.string({ message: "Mã đơn hàng không hợp lệ." }).optional(),
  })
  .strict();

const replySchema = z
  .object({ message: z.string({ message: "Nội dung không được để trống." }) })
  .strict();

// GET /api/v1/support/tickets
router.get(
  "/tickets",
  asyncHandler(async (req: AuthRequest, res) => {
    const user = currentUser(req);
    const query = listQuerySchema.parse(req.query);
    const paging = parsePaging(req.query);

    const where = {
      userId: user.id,
      ...(query.status ? { status: query.status } : {}),
      ...(query.type ? { type: query.type } : {}),
    };

    const [tickets, total] = await Promise.all([
      prisma.supportTicket.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip: offsetOf(paging),
        take: paging.page_size,
      }),
      prisma.supportTicket.count({ where }),
    ]);

    okList(res, tickets.map(toSupportTicketListItem), pageMeta(paging, total));
  }),
);

// GET /api/v1/support/tickets/:id
router.get(
  "/tickets/:id",
  asyncHandler(async (req: AuthRequest, res) => {
    const user = currentUser(req);
    const id = req.params.id;
    if (!id) throw notFound("Không tìm thấy yêu cầu hỗ trợ này.");

    const ticket = await loadOwnTicket(user.id, id);
    ok(res, await detailOf(ticket));
  }),
);

// POST /api/v1/support/tickets
router.post(
  "/tickets",
  asyncHandler(async (req: AuthRequest, res) => {
    const user = currentUser(req);
    const input = createTicketSchema.parse(req.body);
    if (user.emailVerifiedAt === null && input.type !== "ACCOUNT") {
      throw forbidden("Xác minh email để gửi yêu cầu về giao dịch.");
    }

    const subject = input.subject.trim();
    const message = input.message.trim();
    const errors: Record<string, string> = {};
    const subjectError = validateSupportSubject(subject);
    if (subjectError) errors.subject = subjectError;
    const messageError = validateSupportMessage(message);
    if (messageError) errors.message = messageError;
    if (Object.keys(errors).length > 0) {
      throw validationError("Thông tin yêu cầu hỗ trợ chưa hợp lệ.", errors);
    }

    let orderId: string | null = null;
    if (input.type === "ORDER_PROBLEM") {
      const rawOrderId = input.order_id?.trim() ?? "";
      if (rawOrderId === "") {
        throw validationError("Vấn đề đơn hàng cần chọn đơn liên quan.", {
          order_id: "Bắt buộc.",
        });
      }
      const order = await prisma.order.findUnique({
        where: { id: rawOrderId },
        select: { id: true, buyerId: true, sellerId: true },
      });
      if (!order) throw notFound("Không tìm thấy đơn hàng này.");
      if (order.buyerId !== user.id && order.sellerId !== user.id) {
        throw forbidden("Bạn không phải người mua hoặc người bán của đơn hàng này.");
      }
      orderId = order.id;
    } else if (input.order_id && input.order_id.trim() !== "") {
      throw validationError("Chỉ yêu cầu về vấn đề đơn hàng mới được gắn với đơn hàng.", {
        order_id: "Không hợp lệ.",
      });
    }

    let ticket: SupportTicket | null = null;
    for (let attempt = 1; attempt <= CODE_MAX_ATTEMPTS; attempt += 1) {
      try {
        ticket = await prisma.$transaction(async (tx) => {
          if (orderId !== null) {
            await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${orderId} FOR UPDATE`;
            const lockedOrder = await tx.order.findUnique({
              where: { id: orderId },
              select: { buyerId: true, sellerId: true },
            });
            if (
              lockedOrder === null ||
              (lockedOrder.buyerId !== user.id && lockedOrder.sellerId !== user.id)
            ) {
              throw notFound("Không tìm thấy đơn hàng này.");
            }
          }
          const created = await tx.supportTicket.create({
            data: {
              code: generateTicketCode(),
              userId: user.id,
              orderId,
              subject,
              type: input.type,
              status: "OPEN",
            },
          });
          await tx.supportMessage.create({
            data: { ticketId: created.id, senderId: user.id, role: "USER", message },
          });
          return created;
        });
        break;
      } catch (error) {
        if (!isUniqueViolation(error) || attempt === CODE_MAX_ATTEMPTS) {
          if (isUniqueViolation(error)) {
            throw conflict(
              API_ERROR_CODES.RETRY_LATER,
              "Không tạo được yêu cầu hỗ trợ, vui lòng thử lại sau.",
              409,
            );
          }
          throw error;
        }
      }
    }

    if (!ticket) {
      throw conflict(
        API_ERROR_CODES.RETRY_LATER,
        "Không tạo được yêu cầu hỗ trợ, vui lòng thử lại sau.",
        409,
      );
    }

    ok(res, await detailOf(ticket), 201);
  }),
);

// POST /api/v1/support/tickets/:id/messages
router.post(
  "/tickets/:id/messages",
  asyncHandler(async (req: AuthRequest, res) => {
    const user = currentUser(req);
    const id = req.params.id;
    if (!id) throw notFound("Không tìm thấy yêu cầu hỗ trợ này.");

    const input = replySchema.parse(req.body);
    const message = input.message.trim();
    const messageError = validateSupportMessage(message);
    if (messageError) throw validationError(messageError, { message: messageError });

    // Reopening an owner reply to a RESOLVED ticket happens atomically with
    // appending the message (detail-project 14.4).
    const updated = await prisma.$transaction(async (tx) => {
      const ticket = await lockSupportTicketWithOrder(tx, id);
      if (!ticket || ticket.userId !== user.id) {
        throw notFound("Không tìm thấy yêu cầu hỗ trợ này.");
      }
      if (ticket.status === "CLOSED") {
        throw conflict(
          API_ERROR_CODES.INVALID_ORDER_TRANSITION,
          "Yêu cầu đã đóng, vui lòng tạo yêu cầu hỗ trợ mới.",
          409,
        );
      }
      const now = new Date();
      const result = await tx.supportTicket.update({
        where: { id: ticket.id },
        data:
          ticket.status === "RESOLVED"
            ? { status: "OPEN", resolvedAt: null, resolutionNote: null, updatedAt: now }
            : { updatedAt: now },
      });
      await tx.supportMessage.create({
        data: { ticketId: ticket.id, senderId: user.id, role: "USER", message },
      });
      if (ticket.assignedAdminId) {
        await tx.notification.create({
          data: {
            userId: ticket.assignedAdminId,
            type: "TICKET_REPLY",
            title: "Có phản hồi mới trong yêu cầu hỗ trợ",
            content: `Yêu cầu ${ticket.code} có phản hồi mới từ ${user.fullName}.`,
            referenceType: "ticket",
            referenceId: ticket.id,
          },
        });
      }
      return result;
    });

    ok(res, await detailOf(updated));
  }),
);

// POST /api/v1/support/tickets/:id/close
router.post(
  "/tickets/:id/close",
  asyncHandler(async (req: AuthRequest, res) => {
    const user = currentUser(req);
    const id = req.params.id;
    if (!id) throw notFound("Không tìm thấy yêu cầu hỗ trợ này.");

    const updated = await prisma.$transaction(async (tx) => {
      const ticket = await lockSupportTicketWithOrder(tx, id);
      if (!ticket || ticket.userId !== user.id) {
        throw notFound("Không tìm thấy yêu cầu hỗ trợ này.");
      }
      if (ticket.status !== "RESOLVED") {
        throw conflict(
          API_ERROR_CODES.INVALID_ORDER_TRANSITION,
          ticket.status === "CLOSED"
            ? "Yêu cầu đã được đóng trước đó."
            : "Chỉ đóng được yêu cầu đã được quản trị viên giải quyết.",
          409,
        );
      }
      return tx.supportTicket.update({
        where: { id: ticket.id },
        data: { status: "CLOSED", closedAt: new Date() },
      });
    });

    ok(res, await detailOf(updated));
  }),
);

export { router as supportRouter };
