import {
  API_ERROR_CODES,
  ORDER_STATUS_LABELS,
  PRODUCT_STATUS_LABELS,
  formatVnd,
  provinceLabel,
} from "@remarket/shared";
import type {
  ProductCapabilities,
  ProductDetail,
  ProductListItem,
  SellerSummary,
} from "@remarket/shared";
import { ApiError } from "../lib/errors";
import type { Database, MockOrder, MockProduct, MockUser } from "./types";

/** Errors are thrown as ApiError so UI error branches match a live API. */
export function fail(
  status: number,
  code: string,
  message: string,
  details?: Record<string, unknown>,
): never {
  throw new ApiError({ status, code, message, details });
}

export function notFound(message = "Không tìm thấy nội dung này."): never {
  return fail(404, API_ERROR_CODES.NOT_FOUND, message);
}

export function forbidden(message = "Bạn không có quyền thực hiện thao tác này."): never {
  return fail(403, API_ERROR_CODES.FORBIDDEN, message);
}

export function unauthorized(message = "Phiên đăng nhập chưa hợp lệ."): never {
  return fail(401, API_ERROR_CODES.UNAUTHORIZED, message);
}

export function conflict(code: string, message: string, details?: Record<string, unknown>): never {
  return fail(409, code, message, details);
}

export function validationError(message: string, fields?: Record<string, string>): never {
  return fail(422, API_ERROR_CODES.VALIDATION_ERROR, message, { fields });
}

export function requireAuth(user: MockUser | null): MockUser {
  if (user === null) unauthorized();
  return user;
}

export function requireActive(user: MockUser | null): MockUser {
  const current = requireAuth(user);
  if (current.status === "LOCKED") {
    fail(403, API_ERROR_CODES.ACCOUNT_LOCKED, "Tài khoản đang bị hạn chế.");
  }
  return current;
}

export function requireVerified(user: MockUser | null): MockUser {
  const current = requireActive(user);
  if (current.email_verified_at === null) {
    fail(403, API_ERROR_CODES.EMAIL_NOT_VERIFIED, "Email chưa được xác minh.");
  }
  return current;
}

export function requireAdmin(user: MockUser | null): MockUser {
  const current = requireAuth(user);
  if (current.role !== "ADMIN" || current.status !== "ACTIVE") forbidden();
  return current;
}

/* ------------------------------------------------------------------ *
 * Domain helpers
 * ------------------------------------------------------------------ */

export function findUser(database: Database, id: string): MockUser | undefined {
  return database.users.find((entry) => entry.id === id);
}

export function mustFindUser(database: Database, id: string): MockUser {
  const entry = findUser(database, id);
  if (!entry) notFound("Không tìm thấy người dùng này.");
  return entry;
}

export function findProduct(database: Database, id: string): MockProduct | undefined {
  return database.products.find((entry) => entry.id === id && entry.deleted_at === null);
}

export function mustFindProduct(database: Database, id: string): MockProduct {
  const entry = findProduct(database, id);
  if (!entry) notFound("Không tìm thấy tin đăng này.");
  return entry;
}

export function categoryById(database: Database, id: string) {
  return database.categories.find((entry) => entry.id === id);
}

/** A category accepts new listings only when it is a leaf with active ancestors. */
export function isCategoryValid(database: Database, categoryId: string): boolean {
  const category = categoryById(database, categoryId);
  if (!category || category.status !== "ACTIVE") return false;
  const isLeaf = !database.categories.some((entry) => entry.parent_id === category.id);
  if (!isLeaf) return false;
  let parentId = category.parent_id;
  while (parentId) {
    const parent = categoryById(database, parentId);
    if (!parent || parent.status !== "ACTIVE") return false;
    parentId = parent.parent_id;
  }
  return true;
}

/** Path root → leaf, e.g. ["Điện tử", "Laptop"]. */
export function categoryPath(database: Database, categoryId: string): string[] {
  const path: string[] = [];
  let current = categoryById(database, categoryId);
  while (current) {
    path.unshift(current.name);
    current = current.parent_id ? categoryById(database, current.parent_id) : undefined;
  }
  return path;
}

export function categoryWithChildren(database: Database, categoryId: string): string[] {
  const ids = [categoryId];
  let changed = true;
  while (changed) {
    changed = false;
    for (const category of database.categories) {
      if (category.parent_id && ids.includes(category.parent_id) && !ids.includes(category.id)) {
        ids.push(category.id);
        changed = true;
      }
    }
  }
  return ids;
}

export function sellerSummary(database: Database, userId: string): SellerSummary {
  const user = mustFindUser(database, userId);
  const visibleReviews = database.reviews.filter(
    (review) => review.reviewed_user_id === userId && review.hidden_at === null,
  );
  const rating =
    visibleReviews.length === 0
      ? null
      : Math.round(
          (visibleReviews.reduce((sum, review) => sum + review.rating, 0) /
            visibleReviews.length) *
            10,
        ) / 10;
  const completed = database.orders.filter(
    (order) => order.seller_id === userId && order.status === "COMPLETED",
  ).length;

  return {
    id: user.id,
    name: user.full_name,
    avatar_url: user.avatar_url,
    province_code: user.province_code,
    province_label: provinceLabel(user.province_code),
    joined_at: user.joined_at,
    rating,
    review_count: visibleReviews.length,
    completed_sales_count: completed,
  };
}

/** Whether a product may appear in public lists/search (detail-project 6.3). */
export function isPubliclyVisible(database: Database, product: MockProduct): boolean {
  if (product.deleted_at !== null || product.is_blocked) return false;
  if (product.status !== "ACTIVE") return false;
  const seller = findUser(database, product.seller_id);
  if (!seller || seller.status !== "ACTIVE" || seller.email_verified_at === null) return false;
  return isCategoryValid(database, product.category_id);
}

export function projectListItem(
  database: Database,
  product: MockProduct,
  viewer: MockUser | null,
): ProductListItem {
  const hidden = product.deleted_at !== null || product.is_blocked;
  const isFavorited = viewer
    ? database.favorites.some(
        (favorite) => favorite.user_id === viewer.id && favorite.product_id === product.id,
      )
    : false;

  return {
    id: product.id,
    title: hidden ? "" : product.title.trim(),
    price: hidden ? "0" : product.price,
    image_url: hidden ? null : (product.images[0]?.url ?? null),
    condition: product.condition,
    province_code: product.province_code,
    province_label: provinceLabel(product.province_code),
    published_at: product.published_at,
    created_at: product.created_at,
    status: product.status,
    is_favorited: isFavorited,
    seller: sellerSummary(database, product.seller_id),
    is_blocked: product.is_blocked,
    is_hidden: hidden,
  };
}

export function productCapabilities(
  database: Database,
  product: MockProduct,
  viewer: MockUser | null,
): ProductCapabilities {
  const isOwner = viewer !== null && viewer.id === product.seller_id;
  const base = {
    can_buy: false,
    can_add_to_cart: false,
    can_chat: false,
    can_favorite: viewer !== null && !isOwner,
    can_report: viewer !== null && !isOwner,
    can_edit: false,
    can_manage: false,
    unavailable_reason: null as string | null,
  };

  if (isOwner) {
    const editable = ["PENDING", "REJECTED", "INACTIVE", "ACTIVE"].includes(product.status);
    return {
      ...base,
      can_favorite: false,
      can_report: false,
      can_edit: editable && !product.is_blocked,
      can_manage: true,
      unavailable_reason: editable ? null : "Tin đang được giữ hoặc đã bán, chỉ xem được.",
    };
  }

  if (viewer && viewer.status === "LOCKED") {
    return { ...base, unavailable_reason: "Tài khoản đang bị hạn chế." };
  }
  if (viewer && viewer.email_verified_at === null) {
    return { ...base, unavailable_reason: "Xác minh email để mua hàng và nhắn tin." };
  }
  if (product.deleted_at !== null || product.is_blocked) {
    return { ...base, unavailable_reason: "Tin đăng không còn khả dụng." };
  }
  if (product.status === "RESERVED") {
    return { ...base, unavailable_reason: "Sản phẩm đang được giữ cho một giao dịch." };
  }
  if (product.status !== "ACTIVE") {
    return { ...base, unavailable_reason: "Sản phẩm không khả dụng để mua." };
  }
  if (!isCategoryValid(database, product.category_id)) {
    return { ...base, unavailable_reason: "Danh mục sản phẩm không còn hoạt động." };
  }

  return {
    ...base,
    can_buy: true,
    can_add_to_cart: true,
    can_chat: true,
    unavailable_reason: null,
  };
}

export function projectDetail(
  database: Database,
  product: MockProduct,
  viewer: MockUser | null,
): ProductDetail {
  const list = projectListItem(database, product, viewer);
  return {
    ...list,
    description: product.description,
    images: [...product.images].sort((a, b) => a.sort_order - b.sort_order),
    category_id: product.category_id,
    category_path: categoryPath(database, product.category_id),
    usage_months: product.usage_months,
    delivery_method: product.delivery_method,
    shipping_fee: product.shipping_fee,
    version: product.version,
    is_blocked: product.is_blocked,
    block_reason: product.block_reason,
    rejection_reason: product.rejection_reason,
    capabilities: productCapabilities(database, product, viewer),
  };
}

export function publicRatingText(rating: number | null): string {
  if (rating === null) return "Chưa có đánh giá";
  return `${rating.toLocaleString("vi-VN", { minimumFractionDigits: 1 })}/5`;
}

export function statusLabel(status: keyof typeof PRODUCT_STATUS_LABELS): string {
  return PRODUCT_STATUS_LABELS[status].label;
}

export function orderStatusLabel(status: keyof typeof ORDER_STATUS_LABELS): string {
  return ORDER_STATUS_LABELS[status].label;
}

/* ------------------------------------------------------------------ *
 * Pagination
 * ------------------------------------------------------------------ */

export interface PageParams {
  page: number;
  page_size: number;
}

export function parsePaging(
  raw: { page?: number; page_size?: number } | undefined,
): PageParams {
  const page = Math.max(1, Math.trunc(raw?.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Math.trunc(raw?.page_size ?? 20)));
  return { page, page_size: pageSize };
}

export function paginate<T>(
  rows: T[],
  paging: PageParams,
): { slice: T[]; meta: { page: number; page_size: number; total: number; total_pages: number } } {
  const total = rows.length;
  const total_pages = Math.max(1, Math.ceil(total / paging.page_size));
  const start = (paging.page - 1) * paging.page_size;
  return {
    slice: rows.slice(start, start + paging.page_size),
    meta: { page: paging.page, page_size: paging.page_size, total, total_pages },
  };
}

/* ------------------------------------------------------------------ *
 * Money & status projection
 * ------------------------------------------------------------------ */

export function assertVnd(value: string, label: string): void {
  if (!/^\d+$/.test(value)) {
    validationError(`${label} phải là số nguyên VND.`, { [label]: "invalid" });
  }
}

export function displayPrice(price: string): string {
  return formatVnd(price);
}

export function openOrderTicket(database: Database, orderId: string) {
  return database.tickets.find(
    (ticket) =>
      ticket.order_id === orderId &&
      ticket.type === "ORDER_PROBLEM" &&
      (ticket.status === "OPEN" || ticket.status === "IN_PROGRESS"),
  );
}

export function isOrderParticipant(order: MockOrder, user: MockUser | null): boolean {
  return user !== null && (order.buyer_id === user.id || order.seller_id === user.id);
}
