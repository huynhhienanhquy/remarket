import type { Prisma, User } from "@prisma/client";
import type { TicketStatus } from "@remarket/shared";
import { TICKET_STATUS_LABELS, validateSupportMessage } from "@remarket/shared";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../utils/prisma.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import type { AuthRequest } from "../middleware/auth.js";
import { ok, okList } from "../shared/api-response.js";
import { invalidTransition, notFound, validationError } from "../shared/errors.js";
import { offsetOf, pageMeta, parsePaging } from "../shared/pagination.js";
import {
  toAdminSupportTicketDetail,
  toAdminSupportTicketItem,
  toSupportTicketDetail,
} from "../shared/dto-mappers.js";
import { adminActor, adminDateRange, writeAudit } from "../shared/admin-helpers.js";
import { lockSupportTicketWithOrder } from "../services/support-ticket-lock.js";

/**
 * Admin support queue (detail-project 14.4): the list and status changes live
 * under `/admin/support-tickets`, and the state machine
 * is OPEN -> IN_PROGRESS -> RESOLVED -> CLOSED with a reopen in between.
 */

const router = Router();

const listQuery = z
  .object({
    status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED", "ALL"]).optional(),
    type: z.enum(["ACCOUNT", "ORDER_PROBLEM", "PRODUCT", "OTHER", "ALL"]).optional(),
    assigned_admin_id: z.string().trim().min(1).max(64).optional(),
    from: z.string().optional(),
    to: z.string().optional(),
    page: z.string().optional(),
    page_size: z.string().optional(),
  })
  .strict();

// GET /api/v1/admin/support-tickets?status&type&page&page_size
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const query = listQuery.parse(req.query);
    const paging = parsePaging(req.query);

    const where: Prisma.SupportTicketWhereInput = {};
    if (query.status !== undefined && query.status !== "ALL") where.status = query.status;
    if (query.type !== undefined && query.type !== "ALL") where.type = query.type;
    if (query.assigned_admin_id !== undefined) {
      where.assignedAdminId = query.assigned_admin_id === "UNASSIGNED" ? null : query.assigned_admin_id;
    }
    where.updatedAt = adminDateRange(query.from, query.to);

    const [tickets, total] = await Promise.all([
      prisma.supportTicket.findMany({
        where,
        include: { user: true, assignedAdmin: true },
        orderBy: { updatedAt: "desc" },
        skip: offsetOf(paging),
        take: paging.page_size,
      }),
      prisma.supportTicket.count({ where }),
    ]);

    okList(
      res,
      tickets.map((ticket) =>
        toAdminSupportTicketItem(ticket, ticket.user, ticket.assignedAdmin),
      ),
      pageMeta(paging, total),
    );
  }),
);

/**
 * OPEN → IN_PROGRESS → RESOLVED → CLOSED, RESOLVED may reopen to OPEN and
 * an admin may close an open state with a written conclusion. A CLOSED
 * ticket never moves again.
 */
function assertTicketTransition(from: TicketStatus, to: TicketStatus): void {
  if (from === "CLOSED") {
    throw invalidTransition("Yêu cầu đã đóng, không thể thay đổi trạng thái.");
  }
  if (from === to) return;

  const allowed =
    (from === "OPEN" && (to === "IN_PROGRESS" || to === "CLOSED")) ||
    (from === "IN_PROGRESS" && (to === "RESOLVED" || to === "CLOSED")) ||
    (from === "RESOLVED" && (to === "OPEN" || to === "CLOSED"));

  if (!allowed) {
    throw invalidTransition(
      `Không thể chuyển yêu cầu từ "${TICKET_STATUS_LABELS[from].label}" sang "${TICKET_STATUS_LABELS[to].label}".`,
    );
  }
}

const patchBody = z
  .object({
    status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]).optional(),
    resolution_note: z.string().trim().max(2000).optional(),
    assigned_admin_id: z.string().trim().min(1).max(64).nullable().optional(),
    assign: z.boolean().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (Object.keys(value).length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Cần ít nhất một trường yêu cầu hỗ trợ để cập nhật.",
      });
    }
    if (value.assigned_admin_id !== undefined && value.assign !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["assign"],
        message: "Chỉ dùng một cách phân công quản trị viên.",
      });
    }
  });

async function adminTicketDetail(id: string) {
  const detail = await prisma.supportTicket.findUnique({
    where: { id },
    include: {
      messages: { orderBy: { createdAt: "asc" } },
      assignedAdmin: true,
      user: true,
      order: {
        include: {
          items: true,
          buyer: true,
          seller: true,
          statusHistory: true,
        },
      },
    },
  });
  if (detail === null) throw notFound("Không tìm thấy yêu cầu hỗ trợ này.");

  const senderIds = [...new Set(detail.messages.map((message) => message.senderId))];
  const senders = await prisma.user.findMany({ where: { id: { in: senderIds } } });
  const senderNames = new Map<string, User>();
  for (const sender of senders) senderNames.set(sender.id, sender);
  const base = toSupportTicketDetail(
    detail,
    detail.messages,
    senderNames,
    true,
    detail.assignedAdmin?.fullName ?? null,
  );
  return toAdminSupportTicketDetail(base, detail.user, detail.assignedAdmin, detail.order);
}

// GET /api/v1/admin/support-tickets/:id
router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = req.params.id;
    if (id === undefined) throw notFound("Không tìm thấy yêu cầu hỗ trợ này.");
    ok(res, await adminTicketDetail(id));
  }),
);

const replyBody = z.object({ message: z.string() }).strict();

// POST /api/v1/admin/support-tickets/:id/messages
router.post(
  "/:id/messages",
  asyncHandler(async (req: AuthRequest, res) => {
    const actor = adminActor(req);
    const id = req.params.id;
    if (id === undefined) throw notFound("Không tìm thấy yêu cầu hỗ trợ này.");
    const { message: rawMessage } = replyBody.parse(req.body);
    const message = rawMessage.trim();
    const messageError = validateSupportMessage(message);
    if (messageError) throw validationError(messageError, { message: messageError });

    await prisma.$transaction(async (tx) => {
      const ticket = await lockSupportTicketWithOrder(tx, id);
      if (ticket === null) throw notFound("Không tìm thấy yêu cầu hỗ trợ này.");
      if (ticket.status === "CLOSED") {
        throw invalidTransition("Yêu cầu đã đóng, không thể trả lời thêm.");
      }
      await tx.supportMessage.create({
        data: { ticketId: ticket.id, senderId: actor.id, role: "ADMIN", message },
      });
      await tx.supportTicket.update({
        where: { id: ticket.id },
        data: {
          updatedAt: new Date(),
          assignedAdminId: ticket.assignedAdminId ?? actor.id,
          status: ticket.status === "OPEN" ? "IN_PROGRESS" : ticket.status,
        },
      });
      await tx.notification.create({
        data: {
          userId: ticket.userId,
          type: "TICKET_REPLY",
          title: "Yêu cầu hỗ trợ có phản hồi mới",
          content: `Yêu cầu ${ticket.code} vừa được quản trị viên phản hồi.`,
          referenceType: "ticket",
          referenceId: ticket.id,
        },
      });
      await writeAudit(tx, {
        actorId: actor.id,
        actorName: actor.fullName,
        action: "ticket.reply",
        entityType: "ticket",
        entityId: ticket.id,
        reason: null,
        metadata: {},
      });
    });

    ok(res, await adminTicketDetail(id));
  }),
);

// PATCH /api/v1/admin/support-tickets/:id
router.patch(
  "/:id",
  asyncHandler(async (req: AuthRequest, res) => {
    const actor = adminActor(req);
    const body = patchBody.parse(req.body);

    const id = req.params.id;
    if (id === undefined) throw notFound("Không tìm thấy yêu cầu hỗ trợ này.");
    const ticketId = await prisma.$transaction(async (tx) => {
      const ticket = await lockSupportTicketWithOrder(tx, id);
      if (ticket === null) throw notFound("Không tìm thấy yêu cầu hỗ trợ này.");

      const from = ticket.status;
      let status = from;
      if (body.status !== undefined) {
        assertTicketTransition(from, body.status);
        status = body.status;
      }

      let assignedAdminId = ticket.assignedAdminId;
      if (body.assigned_admin_id !== undefined) {
        if (body.assigned_admin_id === null) {
          assignedAdminId = null;
        } else {
          const assignee = await tx.user.findUnique({ where: { id: body.assigned_admin_id } });
          if (assignee === null || assignee.role !== "ADMIN" || assignee.status !== "ACTIVE") {
            throw validationError("Phân công chưa hợp lệ.", {
              assigned_admin_id: "Chỉ phân công cho quản trị viên đang hoạt động.",
            });
          }
          assignedAdminId = assignee.id;
        }
      } else if (body.assign === true) {
        assignedAdminId = actor.id;
      }

      let resolutionNote = ticket.resolutionNote;
      if (body.resolution_note !== undefined) {
        resolutionNote = body.resolution_note === "" ? null : body.resolution_note;
      } else if (from === "RESOLVED" && status === "OPEN") {
        resolutionNote = null;
      }

      const statusChanged = status !== from;
      const noteChanged = resolutionNote !== ticket.resolutionNote;
      const assignChanged = assignedAdminId !== ticket.assignedAdminId;

      if ((status === "RESOLVED" || status === "CLOSED") && (resolutionNote ?? "").trim() === "") {
        throw validationError("Yêu cầu cần có kết luận trước khi kết thúc xử lý.", {
          resolution_note: "Bắt buộc.",
        });
      }

      if (statusChanged || noteChanged || assignChanged) {
        const now = new Date();
        const data: Prisma.SupportTicketUncheckedUpdateInput = {};
        if (statusChanged) {
          data.status = status;
          if (status === "RESOLVED") {
            data.resolvedAt = now;
            data.closedAt = null;
          } else if (status === "CLOSED") {
            data.closedAt = now;
          } else {
            data.closedAt = null;
            if (from === "RESOLVED") data.resolvedAt = null;
          }
        }
        if (noteChanged) data.resolutionNote = resolutionNote;
        if (assignChanged) data.assignedAdminId = assignedAdminId;

        await tx.supportTicket.update({ where: { id: ticket.id }, data });
        const action = statusChanged
          ? "ticket.status"
          : assignChanged
            ? "ticket.assign"
            : "ticket.update";
        await writeAudit(tx, {
          actorId: actor.id,
          actorName: actor.fullName,
          action,
          entityType: "ticket",
          entityId: ticket.id,
          reason: null,
          metadata: statusChanged
            ? { from_status: from, to_status: status }
            : assignChanged
              ? { assigned_admin_id: assignedAdminId }
              : { resolution_note_changed: true },
        });
      }
      return ticket.id;
    });

    ok(res, await adminTicketDetail(ticketId));
  }),
);

export { router as adminSupportRouter };
