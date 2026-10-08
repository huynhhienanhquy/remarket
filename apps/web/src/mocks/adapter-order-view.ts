import type { OrderAction, OrderDetail, OrderListItem, Review } from "@remarket/shared";

import { REVIEW_LIMITS } from "@remarket/shared";
import type { Database, MockOrder, MockReview, MockUser } from "./types";
import { openOrderTicket, sellerSummary } from "./adapter-helpers";

function projectReview(review: MockReview): Review {
  return {
    id: review.id,
    order_id: review.order_id,
    rating: review.rating,
    comment: review.comment,
    created_at: review.created_at,
    reviewer: review.reviewer,
    reviewed_user_id: review.reviewed_user_id,
  };
}

/** Conversation attached to the order's first product, if one exists. */
export function conversationForOrder(database: Database, order: MockOrder): string | null {
  const productIds = order.items.map((item) => item.product_id);
  const conversation = database.conversations.find(
    (entry) =>
      productIds.includes(entry.product_id) &&
      entry.buyer_id === order.buyer_id &&
      entry.seller_id === order.seller_id,
  );
  return conversation?.id ?? null;
}

/**
 * Viewer-dependent actions for one order (ui-spec 17/18). Mirrors the state
 * machine in detail-project 9; the API must return the authoritative list when
 * the backend exists.
 */
export function orderAllowedActions(
  database: Database,
  order: MockOrder,
  viewer: MockUser | null,
): OrderAction[] {
  if (!viewer) return [];
  const isBuyer = order.buyer_id === viewer.id;
  const isSeller = order.seller_id === viewer.id;
  if (!isBuyer && !isSeller) return [];

  const locked = viewer.status === "LOCKED";
  if (locked) return ["support"];

  const blockedByTicket = openOrderTicket(database, order.id) !== undefined;
  const actions: OrderAction[] = [];
  const add = (action: OrderAction) => {
    if (!actions.includes(action)) actions.push(action);
  };

  if (order.status === "CANCELLED") {
    add("support");
    return actions;
  }

  if (isBuyer) {
    switch (order.status) {
      case "PENDING":
        add("cancel");
        break;
      case "CONFIRMED":
        if (order.delivery_method === "MEETUP") add("deliver");
        else add("cancel");
        break;
      case "SHIPPING":
        add("deliver");
        break;
      case "DELIVERED":
        if (!blockedByTicket) add("complete");
        break;
      case "COMPLETED": {
        const review = database.reviews.find(
          (entry) => entry.order_id === order.id && entry.reviewer_id === viewer.id,
        );
        const withinWindow =
          order.completed_at !== null &&
          Date.now() - new Date(order.completed_at).getTime() <=
            REVIEW_LIMITS.windowDays * 24 * 60 * 60 * 1000;
        if (!review && withinWindow) add("review");
        break;
      }
      default:
        break;
    }
    if (order.status !== "COMPLETED") add("support");
    else add("support");
    add("chat");
    return actions;
  }

  // Seller side
  switch (order.status) {
    case "PENDING": {
      const expired = order.expires_at !== null && new Date(order.expires_at).getTime() <= Date.now();
      if (!expired) add("confirm");
      add("cancel");
      break;
    }
    case "CONFIRMED":
      if (order.delivery_method === "COD") add("ship");
      add("cancel");
      break;
    case "SHIPPING":
      add("deliver");
      break;
    default:
      break;
  }
  if (order.status !== "COMPLETED") add("support");
  else add("support");
  add("chat");
  return actions;
}

export function projectOrderListItem(
  database: Database,
  order: MockOrder,
  viewer: MockUser | null,
): OrderListItem {
  const role: "buyer" | "seller" = viewer && order.seller_id === viewer.id ? "seller" : "buyer";
  const counterpartyId = role === "seller" ? order.buyer_id : order.seller_id;
  return {
    id: order.id,
    code: order.code,
    role,
    counterparty: sellerSummary(database, counterpartyId),
    status: order.status,
    delivery_method: order.delivery_method,
    items: order.items,
    total_amount: order.total_amount,
    created_at: order.created_at,
    expires_at: order.expires_at,
  };
}

export function projectOrderDetail(
  database: Database,
  order: MockOrder,
  viewer: MockUser | null,
): OrderDetail {
  const list = projectOrderListItem(database, order, viewer);
  const isBuyer = viewer !== null && order.buyer_id === viewer.id;
  const ticket = openOrderTicket(database, order.id);

  const existingReview = database.reviews.find(
    (entry) => entry.order_id === order.id && entry.reviewer_id === viewer?.id,
  );
  const withinWindow =
    order.completed_at !== null &&
    Date.now() - new Date(order.completed_at).getTime() <=
      REVIEW_LIMITS.windowDays * 24 * 60 * 60 * 1000;

  let reviewState: OrderDetail["review"];
  if (!isBuyer || order.status !== "COMPLETED") {
    reviewState = {
      can_review: false,
      reason: isBuyer ? "Chỉ đánh giá sau khi đơn hoàn tất." : "Chỉ người mua đánh giá đơn này.",
      existing: existingReview ? projectReview(existingReview) : null,
    };
  } else if (existingReview) {
    reviewState = { can_review: false, reason: "Đơn này đã được đánh giá.", existing: projectReview(existingReview) };
  } else if (!withinWindow) {
    reviewState = {
      can_review: false,
      reason: `Đã quá thời hạn đánh giá (${REVIEW_LIMITS.windowDays} ngày sau khi hoàn tất).`,
      existing: null,
    };
  } else {
    reviewState = { can_review: true, reason: null, existing: null };
  }

  return {
    ...list,
    version: order.version,
    subtotal: order.subtotal,
    shipping_fee: order.shipping_fee,
    currency: order.currency,
    delivery: {
      method: order.delivery_method,
      recipient_name: order.delivery.recipient_name,
      recipient_phone: order.delivery.recipient_phone,
      delivery_address: order.delivery.delivery_address,
      carrier: order.delivery.carrier,
      tracking_code: order.delivery.tracking_code,
    },
    status_history: order.status_history,
    allowed_actions: orderAllowedActions(database, order, viewer),
    completion_block_reason:
      ticket && isBuyer
        ? "Đơn đang được hỗ trợ xử lý nên chưa thể hoàn tất."
        : ticket
          ? "Đơn đang được hỗ trợ xử lý."
          : null,
    cancellation_reason: order.cancellation_reason,
    confirmed_at: order.confirmed_at,
    shipped_at: order.shipped_at,
    delivered_at: order.delivered_at,
    completed_at: order.completed_at,
    cancelled_at: order.cancelled_at,
    review: reviewState,
    conversation_id: conversationForOrder(database, order),
  };
}
