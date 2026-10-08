import type { OrderAction } from "./dto.js";
import type { OrderDeliveryMethod, OrderStatus, ProductStatus } from "./enums.js";

/**
 * UI-side action policy. Detail screens always trust `allowed_actions` from
 * the API; this module only keeps list CTAs consistent with detail (ui-spec 17)
 * and decides what a viewer may see before a request is made. It never replaces
 * server authorization (detail-project 3).
 */

export interface OrderContext {
  role: "buyer" | "seller";
  status: OrderStatus;
  delivery: OrderDeliveryMethod;
}

/** Primary CTA shown on order list cards. */
export function primaryOrderAction(ctx: OrderContext): OrderAction | null {
  const { role, status, delivery } = ctx;

  if (status === "CANCELLED") return null;

  if (role === "buyer") {
    switch (status) {
      case "PENDING":
        return "cancel";
      case "CONFIRMED":
        return delivery === "MEETUP" ? "deliver" : "cancel";
      case "SHIPPING":
        return "deliver";
      case "DELIVERED":
        return "complete";
      case "COMPLETED":
        return "review";
      default:
        return null;
    }
  }

  switch (status) {
    case "PENDING":
      return "confirm";
    case "CONFIRMED":
      return delivery === "COD" ? "ship" : null;
    case "SHIPPING":
      return "deliver";
    case "DELIVERED":
    case "COMPLETED":
      return null;
    default:
      return null;
  }
}

/** Label for the CTA above; mirrors the copy used on the detail screen. */
export const ORDER_ACTION_LABELS: Record<OrderAction, string> = {
  confirm: "Xác nhận đơn",
  cancel: "Hủy đơn",
  ship: "Đã gửi hàng",
  deliver: "Ghi nhận đã giao",
  complete: "Xác nhận hoàn tất",
  review: "Đánh giá",
  support: "Liên hệ hỗ trợ",
  chat: "Nhắn tin",
};

/**
 * Whether a listing can be bought publicly: ACTIVE, not blocked, not deleted
 * and the viewer is not the seller (detail-project 6.3).
 */
export function isBuyable(params: {
  status: ProductStatus;
  is_blocked: boolean;
  is_owner: boolean;
  account_allows_purchase: boolean;
}): boolean {
  return (
    params.status === "ACTIVE" &&
    !params.is_blocked &&
    !params.is_owner &&
    params.account_allows_purchase
  );
}

/** Overlay/badge shown when a card leaves the buyable state. */
export function productAvailabilityMessage(status: ProductStatus): string | null {
  switch (status) {
    case "RESERVED":
      return "Sản phẩm đang được giữ cho một giao dịch";
    case "SOLD":
      return "Sản phẩm đã bán";
    case "PENDING":
      return "Tin đang chờ duyệt";
    case "REJECTED":
      return "Tin bị từ chối";
    case "INACTIVE":
      return "Tin đã bị ẩn";
    default:
      return null;
  }
}

export interface Viewer {
  id: string;
  role: "USER" | "ADMIN";
  status: "ACTIVE" | "LOCKED";
  email_verified_at: string | null;
}

/** Gates used by route guards before any private data is rendered (ui-spec 24). */
export function canAccessPrivate(viewer: Viewer | null): viewer is Viewer {
  return viewer !== null && viewer.status === "ACTIVE";
}

export function isEmailUnverified(viewer: Viewer | null): boolean {
  return viewer !== null && viewer.email_verified_at === null;
}

export function isLocked(viewer: Viewer | null): boolean {
  return viewer !== null && viewer.status === "LOCKED";
}

/** Routes a LOCKED account may still open (detail-project 3). */
export const LOCKED_ALLOWED_PREFIXES = [
  "/orders",
  "/sales",
  "/support",
  "/notifications",
  "/login",
  "/403",
  "/404",
] as const;

export function isRouteAllowedWhenLocked(pathname: string): boolean {
  return LOCKED_ALLOWED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

