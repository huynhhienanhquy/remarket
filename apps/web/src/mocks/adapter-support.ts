import type {
  CreateSupportTicketInput,
  SupportAction,
  SupportMessage,
  SupportTicketDetail,
  SupportTicketListItem,
} from "@remarket/shared";
import {
  TICKET_TYPES,
  validateSupportMessage,
  validateSupportSubject,
} from "@remarket/shared";
import type { SupportApi } from "../lib/api/contract";
import { currentViewer } from "./adapter-auth";
import {
  conflict,
  findUser,
  forbidden,
  isOrderParticipant,
  notFound,
  paginate,
  parsePaging,
  requireActive,
  requireAuth,
  validationError,
} from "./adapter-helpers";
import { db } from "./store";
import { uid } from "./time";
import type { Database, MockTicket, MockUser } from "./types";

/** Excludes I, O, 0, 1 so support codes stay readable when read aloud. */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateCode(database: Database): string {
  let code = "";
  do {
    code = "SUP-";
    for (let i = 0; i < 8; i += 1) {
      code += CODE_ALPHABET.charAt(Math.floor(Math.random() * CODE_ALPHABET.length));
    }
  } while (database.tickets.some((entry) => entry.code === code));
  return code;
}

export function projectTicketListItem(ticket: MockTicket): SupportTicketListItem {
  return {
    id: ticket.id,
    code: ticket.code,
    subject: ticket.subject,
    type: ticket.type,
    status: ticket.status,
    order_id: ticket.order_id,
    created_at: ticket.created_at,
    updated_at: ticket.updated_at,
  };
}

/**
 * Owner and admin see different action sets: the owner can only reply (and
 * close once RESOLVED), the admin drives OPEN → IN_PROGRESS → RESOLVED →
 * CLOSED (detail-project 11.4). CLOSED is terminal for both.
 */
export function ticketAllowedActions(
  ticket: MockTicket,
  isOwner: boolean,
  isAdmin: boolean,
): SupportAction[] {
  if (isAdmin) {
    if (ticket.status === "CLOSED") return [];
    if (ticket.status === "RESOLVED") return ["reply", "close"];
    const actions: SupportAction[] = ["reply", "resolve", "close"];
    if (ticket.status === "OPEN") actions.push("progress");
    return actions;
  }
  if (!isOwner) return [];
  if (ticket.status === "RESOLVED") return ["reply", "close"];
  if (ticket.status === "CLOSED") return [];
  return ["reply"];
}

export function projectTicketDetail(
  database: Database,
  ticket: MockTicket,
  viewer: MockUser | null,
): SupportTicketDetail {
  const isOwner = viewer !== null && viewer.id === ticket.user_id;
  const isAdmin = viewer !== null && viewer.role === "ADMIN";
  const assigned = ticket.assigned_admin_id
    ? findUser(database, ticket.assigned_admin_id)
    : undefined;

  return {
    ...projectTicketListItem(ticket),
    resolution_note: ticket.resolution_note,
    resolved_at: ticket.resolved_at,
    closed_at: ticket.closed_at,
    assigned_admin_name: assigned?.full_name ?? ticket.assigned_admin_name,
    messages: [...ticket.messages],
    allowed_actions: ticketAllowedActions(ticket, isOwner, isAdmin),
  };
}

function mustFindTicket(database: Database, id: string): MockTicket {
  const ticket = database.tickets.find((entry) => entry.id === id);
  if (!ticket) notFound("Không tìm thấy yêu cầu hỗ trợ này.");
  return ticket;
}

/** Owner or admin only; anyone else gets 404 so other tickets stay private. */
function accessTicket(id: string): {
  database: Database;
  ticket: MockTicket;
  viewer: MockUser;
} {
  const viewer = requireAuth(currentViewer());
  const database = db();
  const ticket = mustFindTicket(database, id);
  const isOwner = ticket.user_id === viewer.id;
  const isAdmin = viewer.role === "ADMIN";
  if (!isOwner && !isAdmin) notFound("Không tìm thấy yêu cầu hỗ trợ này.");
  return { database, ticket, viewer };
}

export const supportApi: SupportApi = {
  async list(query) {
    // Admins read every ticket through admin.tickets; this route is per owner.
    const viewer = requireAuth(currentViewer());
    const database = db();
    const paging = parsePaging({ page: query.page, page_size: 20 });

    let rows = database.tickets.filter((entry) => entry.user_id === viewer.id);
    if (query.status) rows = rows.filter((entry) => entry.status === query.status);
    rows = [...rows].sort((a, b) =>
      a.updated_at < b.updated_at ? 1 : a.updated_at > b.updated_at ? -1 : 0,
    );

    const { slice, meta } = paginate(rows, paging);
    return {
      items: slice.map((entry) => projectTicketListItem(entry)),
      meta: { total: meta.total },
    };
  },

  async detail(id) {
    const { database, ticket, viewer } = accessTicket(id);
    return projectTicketDetail(database, ticket, viewer);
  },

  async create(input: CreateSupportTicketInput) {
    const viewer = requireActive(currentViewer());
    const database = db();

    const errors: Record<string, string> = {};
    const subjectError = validateSupportSubject(input.subject);
    if (subjectError) errors.subject = subjectError;
    const messageError = validateSupportMessage(input.message);
    if (messageError) errors.message = messageError;
    if (!(TICKET_TYPES as readonly string[]).includes(input.type)) {
      errors.type = "Hãy chọn loại yêu cầu hỗ trợ.";
    }
    if (Object.keys(errors).length > 0) {
      validationError("Thông tin yêu cầu hỗ trợ chưa hợp lệ.", errors);
    }

    const rawOrderId = input.order_id?.trim() ?? "";
    let orderId: string | null = null;
    if (input.type === "ORDER_PROBLEM") {
      if (rawOrderId === "") {
        validationError("Vấn đề đơn hàng cần chọn đơn liên quan.", {
          order_id: "Bắt buộc.",
        });
      }
      const order = database.orders.find((entry) => entry.id === rawOrderId);
      if (!order) notFound("Không tìm thấy đơn hàng này.");
      if (!isOrderParticipant(order, viewer)) {
        forbidden("Bạn không phải người mua hoặc người bán của đơn hàng này.");
      }
      orderId = order.id;
    } else if (rawOrderId !== "") {
      validationError("Chỉ yêu cầu về vấn đề đơn hàng mới được gắn với đơn hàng.", {
        order_id: "Không hợp lệ.",
      });
    }

    const now = new Date().toISOString();
    const ticketId = uid(7, database.tickets.length + 100);
    const ticket: MockTicket = {
      id: ticketId,
      code: generateCode(database),
      user_id: viewer.id,
      order_id: orderId,
      assigned_admin_id: null,
      assigned_admin_name: null,
      subject: input.subject.trim(),
      type: input.type,
      status: "OPEN",
      resolution_note: null,
      resolved_at: null,
      closed_at: null,
      created_at: now,
      updated_at: now,
      messages: [
        {
          id: `${ticketId}-m1`,
          sender: { id: viewer.id, name: viewer.full_name, role: "USER" },
          message: input.message.trim(),
          created_at: now,
        },
      ],
    };
    database.tickets.push(ticket);
    return projectTicketDetail(database, ticket, viewer);
  },

  async reply(id, message) {
    const { database, ticket, viewer } = accessTicket(id);
    if (ticket.status === "CLOSED") {
      conflict(
        "INVALID_ORDER_TRANSITION",
        "Yêu cầu đã đóng, vui lòng tạo yêu cầu hỗ trợ mới.",
      );
    }
    const messageError = validateSupportMessage(message);
    if (messageError) validationError(messageError, { message: messageError });

    const now = new Date().toISOString();
    const isOwner = ticket.user_id === viewer.id;
    const isAdmin = viewer.role === "ADMIN";
    const appended: SupportMessage = {
      id: `${ticket.id}-m${ticket.messages.length + 1}`,
      sender: {
        id: viewer.id,
        name: viewer.full_name,
        role: isAdmin ? "ADMIN" : "USER",
      },
      message: message.trim(),
      created_at: now,
    };
    ticket.messages.push(appended);

    // Owner answering a RESOLVED ticket reopens it; an admin reply does not.
    if (isOwner && !isAdmin && ticket.status === "RESOLVED") {
      ticket.status = "OPEN";
      ticket.resolved_at = null;
    }
    ticket.updated_at = now;
    return projectTicketDetail(database, ticket, viewer);
  },

  async close(id) {
    const { database, ticket, viewer } = accessTicket(id);
    const isOwner = ticket.user_id === viewer.id;
    const isAdmin = viewer.role === "ADMIN";

    if (ticket.status === "CLOSED") {
      conflict("INVALID_ORDER_TRANSITION", "Yêu cầu đã được đóng trước đó.");
    }
    if (!isAdmin && isOwner && ticket.status !== "RESOLVED") {
      conflict("INVALID_ORDER_TRANSITION", "Chỉ đóng yêu cầu khi đã được giải quyết.");
    }

    const now = new Date().toISOString();
    ticket.status = "CLOSED";
    ticket.closed_at = now;
    ticket.updated_at = now;
    return projectTicketDetail(database, ticket, viewer);
  },
};
