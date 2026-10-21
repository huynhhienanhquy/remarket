import type { Product, Order, SupportTicket } from "@prisma/client";
import type { ProductCapabilities, ProductAction, OrderAction, SupportAction } from "@remarket/shared";
import { REVIEW_LIMITS } from "@remarket/shared";
import type { ProductRow, ViewerContext, OrderRow, OrderViewer } from "../shared/dto-mappers.js";


/**
 * Viewer-dependent capabilities (ui-spec 12/17). The same policy backs the
 * mutation service, which re-checks authorization on every write.
 */
export function productCapabilities(
  product: ProductRow,
  ctx: ViewerContext,
  categoryActive: boolean,
): ProductCapabilities {
  const isOwner = ctx.viewerId !== null && ctx.viewerId === product.sellerId;
  const base: ProductCapabilities = {
    can_buy: false,
    can_add_to_cart: false,
    can_chat: false,
    can_favorite: ctx.viewerId !== null && !isOwner,
    can_report: ctx.viewerId !== null && !isOwner,
    can_edit: false,
    can_manage: false,
    unavailable_reason: null,
  };

  if (isOwner) {
    const editable = ["PENDING", "REJECTED", "INACTIVE", "ACTIVE"].includes(product.status);
    return {
      ...base,
      can_favorite: false,
      can_report: false,
      can_edit: editable && !product.isBlocked && product.deletedAt === null,
      can_manage: true,
      unavailable_reason: editable ? null : "Tin đang được giữ hoặc đã bán, chỉ xem được.",
    };
  }

  if (ctx.viewerStatus === "LOCKED") {
    return { ...base, unavailable_reason: "Tài khoản đang bị hạn chế." };
  }
  if (ctx.viewerId !== null && !ctx.viewerEmailVerified) {
    return { ...base, unavailable_reason: "Xác minh email để mua hàng và nhắn tin." };
  }
  if (product.deletedAt !== null || product.isBlocked) {
    return { ...base, unavailable_reason: "Tin đăng không còn khả dụng." };
  }
  if (product.status === "RESERVED") {
    return { ...base, unavailable_reason: "Sản phẩm đang được giữ cho một giao dịch." };
  }
  if (product.status !== "ACTIVE") {
    return { ...base, unavailable_reason: "Sản phẩm không khả dụng để mua." };
  }
  if (!categoryActive) {
    return { ...base, unavailable_reason: "Danh mục sản phẩm không còn hoạt động." };
  }

  return { ...base, can_buy: true, can_add_to_cart: true, can_chat: true, unavailable_reason: null };
}


/** Owner-only action list (ui-spec 13 table). */
export function ownProductActions(product: Product): ProductAction[] {
  if (product.isBlocked || product.deletedAt !== null) return ["view"];
  if (product.status === "RESERVED" || product.status === "SOLD") return ["view"];
  const actions: ProductAction[] = ["view", "edit", "hide", "delete"];
  if (product.status === "REJECTED" || product.status === "INACTIVE") actions.push("submit");
  return actions;
}


/** Safe message shown when `complete` is unavailable (detail-project 11.2). */
export function completionBlockReason(hasOpenTicket: boolean): string | null {
  if (!hasOpenTicket) return null;
  return "Đơn hàng đang có yêu cầu hỗ trợ chưa xử lý. Vui lòng đóng yêu cầu trước khi xác nhận đã nhận.";
}


/**
 * Authoritative action list for one order (detail-project 11). Derived from
 * role + status + account state + open ticket + expiry, never from the client.
 */
export function orderAllowedActions(
  order: OrderRow,
  viewer: OrderViewer,
  hasOpenTicket: boolean,
  hasExistingReview: boolean,
): OrderAction[] {
  const isBuyer = order.buyerId === viewer.id;
  const isSeller = order.sellerId === viewer.id;
  if (!isBuyer && !isSeller) return [];

  if (viewer.status === "LOCKED") return ["support"];
  if (order.status === "CANCELLED") return ["support"];

  const actions: OrderAction[] = [];
  const add = (action: OrderAction) => {
    if (!actions.includes(action)) actions.push(action);
  };

  const expired = order.expiresAt !== null && order.expiresAt.getTime() <= Date.now();

  if (isBuyer) {
    switch (order.status) {
      case "PENDING":
        add("cancel");
        break;
      case "CONFIRMED":
        if (order.deliveryMethod === "MEETUP") add("deliver");
        add("cancel");
        break;
      case "SHIPPING":
        if (order.deliveryMethod === "COD") add("deliver");
        break;
      case "DELIVERED":
        if (!hasOpenTicket) add("complete");
        break;
      case "COMPLETED": {
        const withinWindow =
          order.completedAt !== null &&
          Date.now() - order.completedAt.getTime() <= REVIEW_LIMITS.windowDays * 24 * 60 * 60 * 1000;
        if (!hasExistingReview && withinWindow) add("review");
        break;
      }
      default:
        break;
    }
  } else {
    switch (order.status) {
      case "PENDING":
        if (!expired) add("confirm");
        add("cancel");
        break;
      case "CONFIRMED":
        if (order.deliveryMethod === "COD") add("ship");
        add("cancel");
        break;
      case "SHIPPING":
        // A seller declaration records the actor but does not prove buyer
        // receipt and never completes the order by itself.
        if (order.deliveryMethod === "COD") add("deliver");
        break;
      default:
        break;
    }
  }

  add("support");
  add("chat");
  return actions;
}


export function orderRole(order: Order, viewerId: string): "buyer" | "seller" {
  return order.sellerId === viewerId ? "seller" : "buyer";
}


export function supportAllowedActions(
  ticket: SupportTicket,
  viewerIsAdmin: boolean,
): SupportAction[] {
  if (viewerIsAdmin) {
    const actions: SupportAction[] = [];
    if (ticket.status !== "CLOSED") actions.push("reply");
    if (ticket.status === "OPEN") actions.push("progress");
    if (ticket.status === "IN_PROGRESS") actions.push("resolve");
    if (ticket.status === "RESOLVED") actions.push("reopen");
    if (ticket.status !== "CLOSED") actions.push("close");
    return actions;
  }
  const actions: SupportAction[] = [];
  if (ticket.status === "OPEN" || ticket.status === "IN_PROGRESS") actions.push("reply");
  if (ticket.status === "RESOLVED") actions.push("reply", "close");
  return actions;
}
