import type {
  AdminDashboard,
  AdminOrderCancelInput,
  AdminOrderCancelResult,
  AdminProductItem,
  AdminReportItem,
  AdminReviewItem,
  AdminSupportTicketDetail,
  AdminSupportTicketItem,
  AdminUserItem,
  AuditLogItem,
  CategoryNode,
  TicketStatus,
} from "@remarket/shared";
import { API_ERROR_CODES, TICKET_STATUS_LABELS, provinceLabel } from "@remarket/shared";
import type { AdminApi } from "../lib/api/contract";
import { currentViewer } from "./adapter-auth";
import {
  categoryById,
  conflict,
  findProduct,
  findUser,
  forbidden,
  isCategoryValid,
  mustFindProduct,
  notFound,
  paginate,
  parsePaging,
  requireAdmin,
  sellerSummary,
  validationError,
} from "./adapter-helpers";
import { projectTicketDetail, projectTicketListItem, supportApi } from "./adapter-support";
import { db } from "./store";
import { uid } from "./time";
import type { Database, MockProduct, MockReport, MockReview, MockTicket, MockUser } from "./types";

/** Same normalization as the marketplace list so admin filters feel identical. */
function normalize(value: string): string {
  return value.toLocaleLowerCase("vi").replace(/\s+/g, " ").trim();
}

function newestFirst(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? 1 : -1;
}

function projectAdminUser(user: MockUser): AdminUserItem {
  return {
    id: user.id,
    full_name: user.full_name,
    email: user.email,
    avatar_url: user.avatar_url,
    phone: user.phone,
    province_code: user.province_code,
    province_label: provinceLabel(user.province_code),
    default_address: user.default_address,
    email_verified_at: user.email_verified_at,
    role: user.role,
    status: user.status,
    created_at: user.joined_at,
    lock_reason: user.lock_reason,
    locked_at: user.locked_at,
  };
}

function projectAdminProduct(database: Database, product: MockProduct): AdminProductItem {
  const category = categoryById(database, product.category_id);
  return {
    id: product.id,
    title: product.title,
    price: product.price,
    image_url: product.images[0]?.url ?? null,
    status: product.status,
    is_blocked: product.is_blocked,
    block_reason: product.block_reason,
    rejection_reason: product.rejection_reason,
    version: product.version,
    updated_at: product.updated_at,
    created_at: product.created_at,
    seller: sellerSummary(database, product.seller_id),
    category_name: category?.name ?? "",
    description: product.description,
    images: product.images,
    condition: product.condition,
    usage_months: product.usage_months,
    province_code: product.province_code,
    delivery_method: product.delivery_method,
    shipping_fee: product.shipping_fee,
  };
}

function projectReportItem(database: Database, report: MockReport): AdminReportItem {
  const handledBy = report.handled_by ? findUser(database, report.handled_by) : undefined;
  return {
    id: report.id,
    target_type: report.target_type,
    target_label: report.target_label,
    target_id: report.target_id,
    reason: report.reason,
    description: report.description,
    status: report.status,
    resolution_note: report.resolution_note,
    created_at: report.created_at,
    updated_at: report.updated_at,
    reporter_name: findUser(database, report.reporter_id)?.full_name ?? "Không xác định",
    handled_by_name: report.handled_by === null ? null : (handledBy?.full_name ?? null),
    handled_at: report.handled_at,
  };
}

function projectReviewItem(database: Database, review: MockReview): AdminReviewItem {
  const order = database.orders.find((entry) => entry.id === review.order_id);
  return {
    id: review.id,
    order_id: review.order_id,
    rating: review.rating,
    comment: review.comment,
    created_at: review.created_at,
    reviewer: review.reviewer,
    reviewed_user_id: review.reviewed_user_id,
    order_code: order?.code ?? "",
    reviewed_user_name:
      findUser(database, review.reviewed_user_id)?.full_name ?? "Không xác định",
    hidden_at: review.hidden_at,
    hidden_reason: review.hidden_reason,
  };
}

function projectAdminTicketItem(
  database: Database,
  ticket: MockTicket,
): AdminSupportTicketItem {
  const user = findUser(database, ticket.user_id);
  const assigned = ticket.assigned_admin_id
    ? findUser(database, ticket.assigned_admin_id)
    : undefined;
  return {
    ...projectTicketListItem(ticket),
    user: { id: ticket.user_id, name: user?.full_name ?? "Không xác định" },
    assigned_admin: assigned
      ? { id: assigned.id, name: assigned.full_name }
      : null,
  };
}

function projectAdminTicketDetail(
  database: Database,
  ticket: MockTicket,
): AdminSupportTicketDetail {
  const order = ticket.order_id
    ? database.orders.find((entry) => entry.id === ticket.order_id) ?? null
    : null;
  return {
    ...projectTicketDetail(database, ticket, currentViewer()),
    ...projectAdminTicketItem(database, ticket),
    order: order
      ? {
          id: order.id,
          code: order.code,
          status: order.status,
          version: order.version,
          buyer: {
            id: order.buyer_id,
            name: findUser(database, order.buyer_id)?.full_name ?? "Người mua",
          },
          seller: {
            id: order.seller_id,
            name: findUser(database, order.seller_id)?.full_name ?? "Người bán",
          },
          delivery_method: order.delivery_method,
          items: order.items,
          total_amount: order.total_amount,
          created_at: order.created_at,
          status_history: order.status_history,
          cancellation_reason: order.cancellation_reason,
        }
      : null,
  };
}

function mustFindReport(database: Database, id: string): MockReport {
  const report = database.reports.find((entry) => entry.id === id);
  if (!report) notFound("Không tìm thấy báo cáo này.");
  return report;
}

function mustFindReview(database: Database, id: string): MockReview {
  const review = database.reviews.find((entry) => entry.id === id);
  if (!review) notFound("Không tìm thấy đánh giá này.");
  return review;
}

function mustFindTicket(database: Database, id: string): MockTicket {
  const ticket = database.tickets.find((entry) => entry.id === id);
  if (!ticket) notFound("Không tìm thấy yêu cầu hỗ trợ này.");
  return ticket;
}

function lockUserRow(target: MockUser, reason: string): void {
  target.status = "LOCKED";
  target.lock_reason = reason;
  target.locked_at = new Date().toISOString();
}

function recordAudit(
  database: Database,
  input: {
    actor: MockUser;
    action: string;
    entity_type: string;
    entity_id: string | null;
    reason: string | null;
    metadata: Record<string, unknown>;
  },
): void {
  database.audit_logs.push({
    id: uid(12, database.audit_logs.length + 100),
    actor_id: input.actor.id,
    actor_name: input.actor.full_name,
    actor_type: "ADMIN",
    action: input.action,
    entity_type: input.entity_type,
    entity_id: input.entity_id,
    reason: input.reason,
    metadata: input.metadata,
    created_at: new Date().toISOString(),
  });
}

/** Accepts `YYYY-MM-DD` and full ISO 8601 bounds; anything else is 422. */
function parseIsoBound(value: string, field: string): number {
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    validationError("Khoảng ngày chưa hợp lệ.", { [field]: "Định dạng YYYY-MM-DD." });
  }
  const time = Date.parse(trimmed);
  if (Number.isNaN(time)) {
    validationError("Khoảng ngày chưa hợp lệ.", { [field]: "Ngày không tồn tại." });
  }
  return time;
}

function inAdminRange(iso: string, from?: string, to?: string): boolean {
  const time = Date.parse(iso);
  const bound = (value: string, field: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) validationError("Khoảng ngày chưa hợp lệ.", { [field]: "Định dạng YYYY-MM-DD." });
    const parsed = parseIsoBound(value, field);
    if (new Date(parsed).toISOString().slice(0, 10) !== value) validationError("Khoảng ngày chưa hợp lệ.", { [field]: "Ngày không tồn tại." });
    return Date.parse(`${value}T00:00:00+07:00`);
  };
  const start = from === undefined ? Number.NEGATIVE_INFINITY : bound(from, "from");
  const end = to === undefined ? Number.POSITIVE_INFINITY : bound(to, "to") + 86_400_000 - 1;
  if (start > end) validationError("Khoảng ngày chưa hợp lệ.", { from: "Ngày bắt đầu phải trước hoặc bằng ngày kết thúc." });
  return time >= start && time <= end;
}

function wasAdministered(database: Database, type: string, id: string, actorId?: string, from?: string, to?: string): boolean {
  if (!actorId && !from && !to) return true;
  return database.audit_logs.some((entry) =>
    entry.actor_type === "ADMIN" && entry.entity_type === type && entry.entity_id === id &&
    (!actorId || entry.actor_id === actorId) && inAdminRange(entry.created_at, from, to),
  );
}

function adminCategoryTree(database: Database): CategoryNode[] {
  return database.categories.filter((entry) => entry.parent_id === null)
    .map((root) => ({ ...root, children: database.categories.filter((entry) => entry.parent_id === root.id) }));
}

/**
 * Admin transitions only (detail-project 11.4): OPEN → IN_PROGRESS →
 * RESOLVED → CLOSED, with IN_PROGRESS/RESOLVED also allowed to go straight to
 * CLOSED. RESOLVED already requires a conclusion stored on the ticket.
 */
function assertAdminTicketTransition(ticket: MockTicket, next: TicketStatus): void {
  const from = ticket.status;
  const allowed =
    (from !== "CLOSED" && from === next) ||
    (from === "OPEN" && (next === "IN_PROGRESS" || next === "CLOSED")) ||
    (from === "IN_PROGRESS" && (next === "RESOLVED" || next === "CLOSED")) ||
    (from === "RESOLVED" && (next === "OPEN" || next === "CLOSED"));

  if (!allowed) {
    if (from === "CLOSED") {
      conflict("INVALID_ORDER_TRANSITION", "Yêu cầu đã đóng, không thể thay đổi trạng thái.");
    }
    if (from === "OPEN" && next === "RESOLVED") {
      conflict(
        "INVALID_ORDER_TRANSITION",
        "Cần chuyển sang đang xử lý trước khi đánh dấu đã giải quyết.",
      );
    }
    conflict(
      "INVALID_ORDER_TRANSITION",
      `Không thể chuyển yêu cầu từ "${TICKET_STATUS_LABELS[from].label}" sang "${TICKET_STATUS_LABELS[next].label}".`,
    );
  }
}

export const adminApi: AdminApi = {
  async dashboard(from, to) {
    const admin = requireAdmin(currentViewer());
    void admin;
    const database = db();
    const inRange = (iso: string | null): boolean => {
      if (iso === null) return false;
      return inAdminRange(iso, from, to);
    };

    const completed = database.orders.filter(
      (order) => order.status === "COMPLETED" && inRange(order.completed_at),
    );
    const value = completed.reduce((sum, order) => sum + BigInt(order.total_amount), 0n);

    const dashboard: AdminDashboard = {
      total_users: database.users.length,
      new_users_in_period: database.users.filter((user) => inRange(user.joined_at)).length,
      pending_products: database.products.filter(
        (product) => product.status === "PENDING" && product.deleted_at === null,
      ).length,
      completed_orders_in_period: completed.length,
      completed_order_value_in_period: value.toString(),
      pending_reports: database.reports.filter((report) => report.status === "PENDING").length,
      products_by_status: {
        PENDING: database.products.filter((p) => p.deleted_at === null && p.status === "PENDING").length,
        ACTIVE: database.products.filter((p) => p.deleted_at === null && p.status === "ACTIVE").length,
        REJECTED: database.products.filter((p) => p.deleted_at === null && p.status === "REJECTED").length,
        RESERVED: database.products.filter((p) => p.deleted_at === null && p.status === "RESERVED").length,
        SOLD: database.products.filter((p) => p.deleted_at === null && p.status === "SOLD").length,
        INACTIVE: database.products.filter((p) => p.deleted_at === null && p.status === "INACTIVE").length,
      },
      blocked_products: database.products.filter((p) => p.deleted_at === null && p.is_blocked).length,
      unresolved_tickets: database.tickets.filter((t) => t.status === "OPEN" || t.status === "IN_PROGRESS").length,
      pending_products_queue: database.products
        .filter((product) => product.status === "PENDING" && product.deleted_at === null)
        .sort((a, b) => newestFirst(a.created_at, b.created_at))
        .slice(0, 5)
        .map((product) => projectAdminProduct(database, product)),
      open_tickets_queue: database.tickets
        .filter((ticket) => ticket.status === "OPEN")
        .sort((a, b) => newestFirst(a.updated_at, b.updated_at))
        .slice(0, 5)
        .map((ticket) => projectAdminTicketItem(database, ticket)),
    };
    return dashboard;
  },

  async users(query) {
    const admin = requireAdmin(currentViewer());
    void admin;
    const database = db();
    const paging = parsePaging({ page: query.page, page_size: 20 });

    let rows = [...database.users];
    rows = rows.filter((user) => wasAdministered(database, "user", user.id, query.handled_by));
    const keyword = query.q?.trim() ?? "";
    if (keyword !== "") {
      const needle = normalize(keyword);
      rows = rows.filter(
        (user) => normalize(user.full_name).includes(needle) || normalize(user.email).includes(needle),
      );
    }
    if (query.status) rows = rows.filter((user) => user.status === query.status);
    if (query.role) rows = rows.filter((user) => user.role === query.role);
    rows = rows.filter((user) => inAdminRange(user.joined_at, query.from, query.to));
    rows.sort((a, b) => newestFirst(a.joined_at, b.joined_at));

    const { slice, meta } = paginate(rows, paging);
    return { items: slice.map((user) => projectAdminUser(user)), meta };
  },

  async user(id) {
    requireAdmin(currentViewer());
    const user = db().users.find((entry) => entry.id === id);
    if (!user) notFound("Không tìm thấy người dùng này.");
    return projectAdminUser(user);
  },

  async lockUser(id, reason) {
    const admin = requireAdmin(currentViewer());
    const trimmed = reason.trim();
    if (trimmed === "") {
      validationError("Cần nhập lý do khóa tài khoản.", { reason: "Bắt buộc." });
    }

    const database = db();
    const target = findUser(database, id);
    if (!target) notFound("Không tìm thấy người dùng này.");
    if (target.id !== admin.id && target.role === "ADMIN") {
      forbidden("Không thể khóa tài khoản quản trị viên khác.");
    }

    lockUserRow(target, trimmed);
    recordAudit(database, {
      actor: admin,
      action: "user.lock",
      entity_type: "user",
      entity_id: target.id,
      reason: trimmed,
      metadata: { status: "LOCKED" },
    });
    return projectAdminUser(target);
  },

  async unlockUser(id) {
    const admin = requireAdmin(currentViewer());
    const database = db();
    const target = findUser(database, id);
    if (!target) notFound("Không tìm thấy người dùng này.");

    target.status = "ACTIVE";
    target.lock_reason = null;
    target.locked_at = null;
    recordAudit(database, {
      actor: admin,
      action: "user.unlock",
      entity_type: "user",
      entity_id: target.id,
      reason: null,
      metadata: { status: "ACTIVE" },
    });
    return projectAdminUser(target);
  },

  async products(query) {
    const admin = requireAdmin(currentViewer());
    void admin;
    const database = db();
    const paging = parsePaging({ page: query.page, page_size: 20 });

    let rows: MockProduct[] = database.products.filter(
      // Same visibility rule as the action endpoints, which 404 on deleted rows.
      (product) => product.deleted_at === null,
    );
    rows = rows.filter((product) => wasAdministered(database, "product", product.id, query.handled_by));
    if (query.status === "BLOCKED") {
      rows = rows.filter((product) => product.is_blocked);
    } else if (query.status) {
      rows = rows.filter((product) => product.status === query.status);
    }
    if (query.category_id) {
      rows = rows.filter((product) => product.category_id === query.category_id);
    }
    if (query.seller_id) rows = rows.filter((product) => product.seller_id === query.seller_id);
    rows = rows.filter((product) => inAdminRange(product.created_at, query.from, query.to));
    const keyword = query.q?.trim() ?? "";
    if (keyword !== "") {
      const needle = normalize(keyword);
      rows = rows.filter((product) => normalize(product.title).includes(needle));
    }
    rows.sort((a, b) => newestFirst(a.created_at, b.created_at));

    const { slice, meta } = paginate(rows, paging);
    return {
      items: slice.map((product) => projectAdminProduct(database, product)),
      meta,
    };
  },

  async approveProduct(id, version) {
    const admin = requireAdmin(currentViewer());
    const database = db();
    const product = mustFindProduct(database, id);

    // Version match is the moderation gate: never approve an older snapshot.
    if (product.version !== version) {
      conflict(
        "VERSION_CONFLICT",
        "Tin đăng đã thay đổi. Vui lòng tải lại và xem xét bản mới nhất.",
      );
    }
    if (product.status !== "PENDING" || product.is_blocked) {
      conflict("INVALID_ORDER_TRANSITION", "Chỉ duyệt được tin đang chờ duyệt.");
    }

    const seller = findUser(database, product.seller_id);
    if (!seller || seller.status !== "ACTIVE" || seller.email_verified_at === null) {
      conflict("FORBIDDEN", "Người bán chưa đủ điều kiện để tin được phê duyệt.");
    }
    if (!isCategoryValid(database, product.category_id)) {
      conflict("FORBIDDEN", "Danh mục của tin đăng không còn hoạt động.");
    }

    const now = new Date().toISOString();
    product.status = "ACTIVE";
    product.published_at = product.published_at ?? now;
    product.rejection_reason = null;
    product.version += 1;
    product.updated_at = now;

    recordAudit(database, {
      actor: admin,
      action: "product.approve",
      entity_type: "product",
      entity_id: product.id,
      reason: null,
      metadata: { version: product.version },
    });
    return projectAdminProduct(database, product);
  },

  async rejectProduct(id, version, reason) {
    const admin = requireAdmin(currentViewer());
    const trimmed = reason.trim();
    if (trimmed === "") {
      validationError("Cần nhập lý do từ chối tin đăng.", { reason: "Bắt buộc." });
    }

    const database = db();
    const product = mustFindProduct(database, id);
    if (product.version !== version) {
      conflict(
        "VERSION_CONFLICT",
        "Tin đăng đã thay đổi. Vui lòng tải lại và xem xét bản mới nhất.",
      );
    }

    if (product.status !== "PENDING") {
      conflict("INVALID_ORDER_TRANSITION", "Chỉ từ chối được tin đang chờ duyệt.");
    }
    const now = new Date().toISOString();
    product.status = "REJECTED";
    product.rejection_reason = trimmed;
    product.version += 1;
    product.updated_at = now;

    recordAudit(database, {
      actor: admin,
      action: "product.reject",
      entity_type: "product",
      entity_id: product.id,
      reason: trimmed,
      metadata: { version: product.version },
    });
    return projectAdminProduct(database, product);
  },

  async blockProduct(id, version, reason) {
    const admin = requireAdmin(currentViewer());
    const trimmed = reason.trim();
    if (trimmed === "") {
      validationError("Cần nhập lý do chặn tin đăng.", { reason: "Bắt buộc." });
    }

    const database = db();
    const product = mustFindProduct(database, id);
    if (product.version !== version) {
      conflict("VERSION_CONFLICT", "Tin đăng đã thay đổi. Vui lòng tải lại và xem xét bản mới nhất.");
    }
    // Blocking is independent of status: RESERVED/SOLD keeps its transaction state.
    product.is_blocked = true;
    product.block_reason = trimmed;
    product.version += 1;
    product.updated_at = new Date().toISOString();

    recordAudit(database, {
      actor: admin,
      action: "product.block",
      entity_type: "product",
      entity_id: product.id,
      reason: trimmed,
      metadata: {},
    });
    return projectAdminProduct(database, product);
  },

  async unblockProduct(id, version) {
    const admin = requireAdmin(currentViewer());
    const database = db();
    const product = mustFindProduct(database, id);
    if (product.version !== version) {
      conflict("VERSION_CONFLICT", "Tin đăng đã thay đổi. Vui lòng tải lại và xem xét bản mới nhất.");
    }
    // Gỡ chặn không tự đăng lại; RESERVED/SOLD giữ nguyên trạng thái giao dịch.
    product.is_blocked = false;
    product.block_reason = null;
    if (product.status !== "RESERVED" && product.status !== "SOLD") product.status = "INACTIVE";
    product.version += 1;
    product.updated_at = new Date().toISOString();

    recordAudit(database, {
      actor: admin,
      action: "product.unblock",
      entity_type: "product",
      entity_id: product.id,
      reason: null,
      metadata: {},
    });
    return projectAdminProduct(database, product);
  },

  async categoryTree() {
    requireAdmin(currentViewer());
    return adminCategoryTree(db());
  },

  async categories(query) {
    requireAdmin(currentViewer());
    const database = db();
    const matches = (category: CategoryNode) =>
      (!query.q || normalize(category.name).includes(normalize(query.q))) &&
      (!query.status || category.status === query.status) &&
      wasAdministered(database, "category", category.id, query.handled_by, query.from, query.to);
    const rows = adminCategoryTree(database).filter((root) => matches(root) || root.children?.some(matches));
    const { slice, meta } = paginate(rows, parsePaging({ page: query.page, page_size: 20 }));
    return { items: slice, meta };
  },

  async createCategory(input) {
    const admin = requireAdmin(currentViewer());
    const database = db();
    const name = input.name.trim();
    const slug = input.slug.trim();

    const errors: Record<string, string> = {};
    if (name.length < 1 || name.length > 100) {
      errors.name = "Tên danh mục cần 1–100 ký tự.";
    }
    if (slug.length < 1 || slug.length > 120) {
      errors.slug = "Slug cần 1–120 ký tự.";
    } else if (database.categories.some((entry) => entry.slug === slug)) {
      errors.slug = "Slug đã được sử dụng, vui lòng chọn slug khác.";
    }
    if (input.parent_id !== null) {
      const parent = categoryById(database, input.parent_id);
      if (!parent) errors.parent_id = "Danh mục cha không tồn tại.";
      else if (parent.parent_id !== null) {
        errors.parent_id = "Chỉ hỗ trợ tối đa hai cấp danh mục.";
      }
    }
    if (Object.keys(errors).length > 0) {
      validationError("Thông tin danh mục chưa hợp lệ.", errors);
    }

    const category: CategoryNode = {
      id: uid(2, database.categories.length + 100),
      parent_id: input.parent_id,
      name,
      slug,
      status: "ACTIVE",
    };
    database.categories.push(category);
    recordAudit(database, { actor: admin, action: "category.create", entity_type: "category", entity_id: category.id, reason: null, metadata: { slug, parent_id: input.parent_id } });
    return { ...category };
  },

  async updateCategory(id, input) {
    const admin = requireAdmin(currentViewer());
    const database = db();
    const category = categoryById(database, id);
    if (!category) notFound("Không tìm thấy danh mục này.");

    const errors: Record<string, string> = {};
    let name = category.name;
    let slug = category.slug;
    let parentId = category.parent_id;
    let status = category.status;

    if (input.name !== undefined) {
      const value = input.name.trim();
      if (value.length < 1 || value.length > 100) {
        errors.name = "Tên danh mục cần 1–100 ký tự.";
      } else {
        name = value;
      }
    }
    if (input.slug !== undefined) {
      const value = input.slug.trim();
      if (value.length < 1 || value.length > 120) {
        errors.slug = "Slug cần 1–120 ký tự.";
      } else if (database.categories.some((entry) => entry.slug === value && entry.id !== id)) {
        errors.slug = "Slug đã được sử dụng, vui lòng chọn slug khác.";
      } else {
        slug = value;
      }
    }
    if (input.parent_id !== undefined) {
      const value = input.parent_id;
      if (value === id) {
        errors.parent_id = "Không thể chọn chính danh mục này làm danh mục cha.";
      } else if (value !== null) {
        const parent = categoryById(database, value);
        if (!parent) {
          errors.parent_id = "Danh mục cha không tồn tại.";
        } else {
          // Walking the proposed chain detects a cycle (the id reappears) and
          // yields the depth that must stay within the two allowed levels.
          let cursor: string | null = parent.id;
          let depth = 0;
          const seen = new Set<string>();
          while (cursor !== null) {
            if (cursor === id || seen.has(cursor)) {
              errors.parent_id = "Không thể tạo vòng lặp danh mục.";
              break;
            }
            seen.add(cursor);
            const node = categoryById(database, cursor);
            if (!node) break;
            depth += 1;
            cursor = node.parent_id;
          }
          if (!errors.parent_id && depth + 1 > 2) {
            errors.parent_id = "Chỉ hỗ trợ tối đa hai cấp danh mục.";
          } else if (!errors.parent_id) {
            parentId = value;
          }
        }
      } else {
        parentId = null;
      }
    }
    if (input.status !== undefined) {
      if (input.status !== "ACTIVE" && input.status !== "INACTIVE") {
        errors.status = "Trạng thái danh mục không hợp lệ.";
      } else {
        status = input.status;
      }
    }
    if (Object.keys(errors).length > 0) {
      validationError("Thông tin danh mục chưa hợp lệ.", errors);
    }

    // Nothing is written before every field passed validation.
    category.name = name;
    category.slug = slug;
    category.parent_id = parentId;
    category.status = status;

    recordAudit(database, {
      actor: admin,
      action: category.status === "INACTIVE" ? "category.disable" : "category.update",
      entity_type: "category",
      entity_id: category.id,
      reason: null,
      metadata: { status: category.status },
    });
    return { ...category };
  },

  async reports(query) {
    const admin = requireAdmin(currentViewer());
    void admin;
    const database = db();
    const paging = parsePaging({ page: query.page, page_size: 20 });

    let rows: MockReport[] = [...database.reports];
    if (query.status) rows = rows.filter((report) => report.status === query.status);
    if (query.reason) rows = rows.filter((report) => report.reason === query.reason);
    if (query.target_type) rows = rows.filter((report) => report.target_type === query.target_type);
    if (query.handled_by) rows = rows.filter((report) => report.handled_by === query.handled_by);
    rows = rows.filter((report) => inAdminRange(report.created_at, query.from, query.to));
    rows.sort((a, b) => newestFirst(a.created_at, b.created_at));

    const { slice, meta } = paginate(rows, paging);
    return {
      items: slice.map((report) => projectReportItem(database, report)),
      meta,
    };
  },

  async resolveReport(id, input) {
    const admin = requireAdmin(currentViewer());
    const note = input.resolution_note.trim();
    if (note === "") {
      validationError("Cần nhập kết luận xử lý báo cáo.", {
        resolution_note: "Bắt buộc.",
      });
    }

    const database = db();
    const report = mustFindReport(database, id);
    if (report.status !== "PENDING") conflict("INVALID_ORDER_TRANSITION", "Báo cáo này đã được xử lý trước đó.");
    const action =
      input.action === undefined || input.action === "none" ? null : input.action;

    if (action === "block_product") {
      if (report.target_type !== "product") {
        conflict(API_ERROR_CODES.NOT_FOUND, "Báo cáo này không gắn với tin đăng.");
      }
      const product = findProduct(database, report.target_id);
      if (!product) {
        conflict(API_ERROR_CODES.NOT_FOUND, "Không tìm thấy tin đăng để chặn.");
      }
      product.is_blocked = true;
      product.block_reason = note;
      product.updated_at = new Date().toISOString();
      recordAudit(database, {
        actor: admin,
        action: "product.block",
        entity_type: "product",
        entity_id: product.id,
        reason: note,
        metadata: { report_id: report.id },
      });
    } else if (action === "lock_user") {
      if (report.target_type !== "user") {
        conflict(API_ERROR_CODES.NOT_FOUND, "Báo cáo này không gắn với người dùng.");
      }
      const target = findUser(database, report.target_id);
      if (!target) {
        conflict(API_ERROR_CODES.NOT_FOUND, "Không tìm thấy người dùng để khóa.");
      }
      if (target.id === admin.id || target.role === "ADMIN") forbidden("Không thể khóa tài khoản quản trị viên.");
      lockUserRow(target, note);
      recordAudit(database, {
        actor: admin,
        action: "user.lock",
        entity_type: "user",
        entity_id: target.id,
        reason: note,
        metadata: { report_id: report.id, status: "LOCKED" },
      });
    }

    const now = new Date().toISOString();
    report.status = "RESOLVED";
    report.resolution_note = note;
    report.handled_by = admin.id;
    report.handled_at = now;
    recordAudit(database, {
      actor: admin,
      action: "report.resolve",
      entity_type: "report",
      entity_id: report.id,
      reason: note,
      metadata: { action: action ?? "none" },
    });
    return projectReportItem(database, report);
  },

  async rejectReport(id, input) {
    const admin = requireAdmin(currentViewer());
    const note = input.resolution_note.trim();
    if (note === "") {
      validationError("Cần nhập lý do không chấp nhận báo cáo.", {
        resolution_note: "Bắt buộc.",
      });
    }

    const database = db();
    const report = mustFindReport(database, id);
    if (report.status !== "PENDING") conflict("INVALID_ORDER_TRANSITION", "Báo cáo này đã được xử lý trước đó.");
    report.status = "REJECTED";
    report.resolution_note = note;
    report.handled_by = admin.id;
    report.handled_at = new Date().toISOString();
    recordAudit(database, {
      actor: admin,
      action: "report.reject",
      entity_type: "report",
      entity_id: report.id,
      reason: note,
      metadata: {},
    });
    return projectReportItem(database, report);
  },

  async reviews(query) {
    const admin = requireAdmin(currentViewer());
    void admin;
    const database = db();
    const paging = parsePaging({ page: query.page, page_size: 20 });

    let rows = [...database.reviews];
    rows = rows.filter((review) => wasAdministered(database, "review", review.id, query.handled_by));
    if (query.rating !== undefined) rows = rows.filter((review) => review.rating === query.rating);
    const keyword = query.q?.trim() ?? "";
    if (keyword !== "") {
      const needle = normalize(keyword);
      rows = rows.filter((review) => normalize(review.comment ?? "").includes(needle));
    }
    if (query.visibility === "VISIBLE") rows = rows.filter((review) => review.hidden_at === null);
    if (query.visibility === "HIDDEN") rows = rows.filter((review) => review.hidden_at !== null);
    rows = rows.filter((review) => inAdminRange(review.created_at, query.from, query.to));
    rows.sort((a, b) => newestFirst(a.created_at, b.created_at));
    const { slice, meta } = paginate(rows, paging);
    return {
      items: slice.map((review) => projectReviewItem(database, review)),
      meta,
    };
  },

  async hideReview(id, reason) {
    const admin = requireAdmin(currentViewer());
    const trimmed = reason.trim();
    if (trimmed === "") {
      validationError("Cần nhập lý do ẩn đánh giá.", { reason: "Bắt buộc." });
    }

    const database = db();
    const review = mustFindReview(database, id);
    if (review.hidden_at !== null) {
      conflict("INVALID_ORDER_TRANSITION", "Đánh giá này đã được ẩn trước đó.");
    }

    review.hidden_at = new Date().toISOString();
    review.hidden_reason = trimmed;
    recordAudit(database, {
      actor: admin,
      action: "review.hide",
      entity_type: "review",
      entity_id: review.id,
      reason: trimmed,
      metadata: {},
    });
    return projectReviewItem(database, review);
  },

  async tickets(query) {
    const admin = requireAdmin(currentViewer());
    void admin;
    const database = db();
    const paging = parsePaging({ page: query.page, page_size: 20 });

    let rows: MockTicket[] = [...database.tickets];
    if (query.status) rows = rows.filter((ticket) => ticket.status === query.status);
    if (query.type) rows = rows.filter((ticket) => ticket.type === query.type);
    if (query.assigned_admin_id) {
      rows = rows.filter((ticket) => query.assigned_admin_id === "UNASSIGNED" ? ticket.assigned_admin_id === null : ticket.assigned_admin_id === query.assigned_admin_id);
    }
    rows = rows.filter((ticket) => inAdminRange(ticket.updated_at, query.from, query.to));
    rows.sort((a, b) => newestFirst(a.updated_at, b.updated_at));

    const { slice, meta } = paginate(rows, paging);
    return {
      items: slice.map((ticket) => projectAdminTicketItem(database, ticket)),
      meta,
    };
  },

  async ticket(id) {
    requireAdmin(currentViewer());
    const database = db();
    return projectAdminTicketDetail(database, mustFindTicket(database, id));
  },

  async replyTicket(id, message) {
    const admin = requireAdmin(currentViewer());
    await supportApi.reply(id, message);
    const database = db();
    const ticket = mustFindTicket(database, id);
    ticket.assigned_admin_id ??= admin.id;
    ticket.assigned_admin_name ??= admin.full_name;
    if (ticket.status === "OPEN") ticket.status = "IN_PROGRESS";
    recordAudit(database, { actor: admin, action: "ticket.reply", entity_type: "ticket", entity_id: id, reason: null, metadata: {} });
    return projectAdminTicketDetail(database, mustFindTicket(database, id));
  },

  async updateTicket(id, input) {
    const admin = requireAdmin(currentViewer());
    const database = db();
    const ticket = mustFindTicket(database, id);

    // Validate the transition first so a rejected status never leaves a
    // half-applied assignment behind.
    if (input.status !== undefined) assertAdminTicketTransition(ticket, input.status);

    if (
      (input.status === "RESOLVED" || input.status === "CLOSED") &&
      (input.resolution_note ?? ticket.resolution_note ?? "").trim() === ""
    ) {
      validationError("Yêu cầu cần có kết luận trước khi kết thúc xử lý.", {
        resolution_note: "Bắt buộc.",
      });
    }

    if (input.resolution_note !== undefined) {
      ticket.resolution_note = input.resolution_note.trim() || null;
      ticket.updated_at = new Date().toISOString();
      if (input.status === undefined && !input.assign) {
        recordAudit(database, { actor: admin, action: "ticket.update", entity_type: "ticket", entity_id: id, reason: null, metadata: { resolution_note_changed: true } });
      }
    } else if (ticket.status === "RESOLVED" && input.status === "OPEN") {
      ticket.resolution_note = null;
    }

    if (input.assign === true) {
      ticket.assigned_admin_id = admin.id;
      ticket.assigned_admin_name = admin.full_name;
      ticket.updated_at = new Date().toISOString();
      recordAudit(database, { actor: admin, action: "ticket.assign", entity_type: "ticket", entity_id: id, reason: null, metadata: { assigned_admin_id: admin.id } });
    }

    if (input.status !== undefined) {
      const now = new Date().toISOString();
      const fromStatus = ticket.status;
      ticket.status = input.status;
      if (input.status === "RESOLVED") ticket.resolved_at = now;
      if (input.status === "CLOSED") ticket.closed_at = now;
      if (input.status === "OPEN" || input.status === "IN_PROGRESS") { ticket.resolved_at = null; ticket.closed_at = null; }
      ticket.updated_at = now;
      recordAudit(database, {
        actor: admin,
        action: "ticket.status",
        entity_type: "ticket",
        entity_id: ticket.id,
        reason: null,
        metadata: { from_status: fromStatus, to_status: input.status },
      });
    }

    return projectAdminTicketDetail(database, ticket);
  },

  cancelOrder: cancelOrderAsAdmin,

  async audit(query) {
    const admin = requireAdmin(currentViewer());
    void admin;
    const database = db();
    const paging = parsePaging({ page: query.page, page_size: 20 });

    let rows: AuditLogItem[] = [...database.audit_logs];
    if (query.action) rows = rows.filter((entry) => entry.action === query.action);
    if (query.entity_type) rows = rows.filter((entry) => entry.entity_type === query.entity_type);
    if (query.entity_id) rows = rows.filter((entry) => entry.entity_id === query.entity_id);
    if (query.actor_id) rows = rows.filter((entry) => entry.actor_id === query.actor_id);
    rows = rows.filter((entry) => inAdminRange(entry.created_at, query.from, query.to));
    rows.sort((a, b) => newestFirst(a.created_at, b.created_at));

    const { slice, meta } = paginate(rows, paging);
    return { items: slice, meta };
  },
};

/**
 * Admin cancel behind the support screen (ui-spec 23.7): the dispute ticket
 * must be an open ORDER_PROBLEM ticket pointing at this exact order, so the
 * action can never be replayed once support has closed the case.
 */
export async function cancelOrderAsAdmin(
  orderId: string,
  input: AdminOrderCancelInput,
): Promise<AdminOrderCancelResult> {
  const admin = requireAdmin(currentViewer());
  const database = db();
  const ticketId = input.ticket_id?.trim();
  const reason = input.reason.trim();

  if (reason === "") {
    validationError("Cần nhập kết luận để hủy đơn.", { reason: "Bắt buộc." });
  }

  const order = database.orders.find((entry) => entry.id === orderId);
  if (!order) notFound("Không tìm thấy đơn hàng này.");
  if (order.version !== input.expected_version) {
    conflict("VERSION_CONFLICT", "Đơn hàng đã thay đổi. Vui lòng tải lại.");
  }
  if (order.status === "COMPLETED" || order.status === "CANCELLED") {
    conflict("INVALID_ORDER_TRANSITION", "Đơn hàng đã kết thúc nên không thể hủy.");
  }

  const afterDelivery = order.status === "SHIPPING" || order.status === "DELIVERED";
  const ticket = ticketId
    ? database.tickets.find((entry) => entry.id === ticketId)
    : undefined;
  if (afterDelivery) {
    if (!ticketId || !input.delivery_outcome || !input.payment_resolution?.trim()) {
      validationError("Hủy sau khi giao cần kết luận hỗ trợ đầy đủ.", {
        ticket_id: "Bắt buộc.",
        delivery_outcome: "Bắt buộc.",
        payment_resolution: "Bắt buộc.",
      });
    }
    if (
      !ticket ||
      ticket.type !== "ORDER_PROBLEM" ||
      ticket.order_id !== orderId ||
      (ticket.status !== "RESOLVED" && ticket.status !== "CLOSED") ||
      !ticket.resolution_note?.trim()
    ) {
      validationError("Ticket hỗ trợ không hợp lệ hoặc chưa có kết luận.", {
        ticket_id: "Ticket phải thuộc đơn này và đã được giải quyết.",
      });
    }
  }

  const now = new Date().toISOString();
  const fromStatus = order.status;
  order.status = "CANCELLED";
  order.cancelled_at = now;
  order.cancelled_by = admin.id;
  order.cancellation_reason = reason;
  order.version += 1;
  order.updated_at = now;
  order.status_history.push({
    from_status: fromStatus,
    to_status: "CANCELLED",
    actor_type: "ADMIN",
    actor_name: admin.full_name,
    reason,
    created_at: now,
  });

  // Release every reservation held by this order (RESERVED <=> reserved_order_id).
  for (const product of database.products) {
    if (product.reserved_order_id !== order.id) continue;
    const seller = findUser(database, product.seller_id);
    product.status = !afterDelivery && !product.is_blocked && seller?.status === "ACTIVE" && seller.email_verified_at !== null && isCategoryValid(database, product.category_id)
      ? "ACTIVE"
      : "INACTIVE";
    product.reserved_order_id = null;
    product.version += 1;
    product.updated_at = now;
  }

  recordAudit(database, {
    actor: admin,
    action: "order.cancel",
    entity_type: "order",
    entity_id: order.id,
    reason,
    metadata: {
      ticket_id: ticket?.id ?? null,
      from_status: fromStatus,
      delivery_outcome: input.delivery_outcome ?? null,
      payment_resolution: input.payment_resolution ?? null,
    },
  });

  return { id: order.id, status: "CANCELLED", version: order.version };
}
