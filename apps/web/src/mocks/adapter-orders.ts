import type { OrderAction, OrderStatus, OrderStatusHistoryEntry } from "@remarket/shared";
import type { OrdersApi } from "../lib/api/contract";
import { currentViewer } from "./adapter-auth";
import { notify } from "./adapter-notify";
import { db } from "./store";
import {
  conflict,
  findProduct,
  forbidden,
  isCategoryValid,
  notFound,
  openOrderTicket,
  paginate,
  parsePaging,
  requireActive,
  validationError,
} from "./adapter-helpers";
import { projectOrderDetail, projectOrderListItem } from "./adapter-order-view";
import type { Database, MockOrder, MockProduct, MockUser } from "./types";

interface TransitionContext {
  database: Database;
  order: MockOrder;
  actor: MockUser;
  viewer: MockUser;
  body: {
    expected_version: number;
    reason?: string;
    carrier?: string;
    tracking_code?: string;
    buyer_confirmed_received?: boolean;
    buyer_confirmed_paid?: boolean;
  };
}

function assertVersion(order: MockOrder, expected: number): void {
  if (order.version !== expected) {
    conflict(
      "VERSION_CONFLICT",
      "Đơn hàng đã thay đổi ở phiên bản khác. Vui lòng tải lại để xem thông tin mới nhất.",
      { current_version: order.version },
    );
  }
}

function orderedProducts(context: TransitionContext, order: MockOrder): MockProduct[] {
  return order.items
    .map((item) => findProduct(context.database, item.product_id))
    .filter((product): product is MockProduct => product !== undefined);
}

function pushHistory(
  order: MockOrder,
  entry: Omit<OrderStatusHistoryEntry, "from_status">,
): void {
  order.status_history.push({ from_status: order.status, ...entry });
  order.status = entry.to_status;
  order.version += 1;
  order.updated_at = entry.created_at;
}

function assertSellerSide(context: TransitionContext, order: MockOrder): void {
  if (order.seller_id !== context.viewer.id) forbidden();
}

function assertBuyerSide(context: TransitionContext, order: MockOrder): void {
  if (order.buyer_id !== context.viewer.id) forbidden();
}

function assertNotExpired(order: MockOrder): void {
  if (order.expires_at !== null && new Date(order.expires_at).getTime() <= Date.now()) {
    conflict("ORDER_EXPIRED", "Đơn đã quá hạn xác nhận. Vui lòng đặt lại món đồ.");
  }
}

/** Returns a listing to a buyable state after the hold is released. */
function releaseProduct(product: MockOrder["items"][number] | MockProduct): void {
  const database = db();
  const full = "reserved_order_id" in product ? (product as MockProduct) : null;
  if (!full) return;
  full.reserved_order_id = null;
  const seller = database.users.find((entry) => entry.id === full.seller_id);
  const sellable =
    full.deleted_at === null &&
    !full.is_blocked &&
    seller !== undefined &&
    seller.status === "ACTIVE" &&
    seller.email_verified_at !== null &&
    isCategoryValid(database, full.category_id);
  full.status = sellable ? "ACTIVE" : "INACTIVE";
  full.version += 1;
  full.updated_at = new Date().toISOString();
}

function counterpartyId(order: MockOrder, actorId: string): string {
  return actorId === order.buyer_id ? order.seller_id : order.buyer_id;
}

function canConfirm(context: TransitionContext): void {
  const { order, body, viewer } = context;
  assertSellerSide(context, order);
  assertVersion(order, body.expected_version);
  if (order.status !== "PENDING") {
    conflict("INVALID_ORDER_TRANSITION", "Chỉ xác nhận được đơn đang chờ xác nhận.");
  }
  assertNotExpired(order);
  if (viewer.status !== "ACTIVE" || viewer.email_verified_at === null) {
    forbidden("Bạn cần tài khoản đang hoạt động để xác nhận đơn.");
  }

  const products = orderedProducts(context, order);
  for (const product of products) {
    if (
      product.status !== "RESERVED" ||
      product.reserved_order_id !== order.id ||
      product.is_blocked ||
      product.deleted_at !== null
    ) {
      conflict("PRODUCT_NOT_AVAILABLE", "Món đồ trong đơn không còn khả dụng.", {
        product_ids: products.map((entry) => entry.id),
      });
    }
    const seller = context.database.users.find((entry) => entry.id === product.seller_id);
    if (!seller || seller.status !== "ACTIVE" || !isCategoryValid(context.database, product.category_id)) {
      conflict("PRODUCT_NOT_AVAILABLE", "Món đồ trong đơn không còn khả dụng.", {
        product_ids: [product.id],
      });
    }
  }

  const now = new Date().toISOString();
  pushHistory(order, {
    to_status: "CONFIRMED",
    actor_type: "USER",
    actor_name: viewer.full_name,
    reason: null,
    created_at: now,
  });
  order.confirmed_at = now;
  notify(context.database, order.buyer_id, {
    type: "ORDER_CONFIRMED",
    title: "Người bán đã xác nhận đơn",
    content: `Đơn #${order.code} đã được xác nhận, chờ giao nhận.`,
    reference_type: "order",
    reference_id: order.id,
  });
}

function canCancel(context: TransitionContext): void {
  const { order, body, viewer } = context;
  const isBuyer = order.buyer_id === viewer.id;
  const isSeller = order.seller_id === viewer.id;
  if (!isBuyer && !isSeller) forbidden();
  assertVersion(order, body.expected_version);
  if (!["PENDING", "CONFIRMED"].includes(order.status)) {
    conflict(
      "INVALID_ORDER_TRANSITION",
      "Đơn đã qua bước giao nhận nên không thể hủy ở đây.",
    );
  }
  if (!body.reason || body.reason.trim() === "") {
    validationError("Vui lòng nhập lý do hủy đơn.", { reason: "Bắt buộc." });
  }

  const now = new Date().toISOString();
  order.cancelled_by = viewer.id;
  order.cancellation_reason = body.reason.trim();
  order.cancelled_at = now;
  pushHistory(order, {
    to_status: "CANCELLED",
    actor_type: "USER",
    actor_name: viewer.full_name,
    reason: body.reason.trim(),
    created_at: now,
  });

  for (const item of order.items) {
    const product = findProduct(context.database, item.product_id);
    if (product && product.reserved_order_id === order.id) releaseProduct(product);
  }

  notify(context.database, counterpartyId(order, viewer.id), {
    type: "ORDER_CANCELLED",
    title: "Đơn hàng đã bị hủy",
    content: `Đơn #${order.code} đã hủy. ${body.reason.trim()}`,
    reference_type: "order",
    reference_id: order.id,
  });
}

function canShip(context: TransitionContext): void {
  const { order, body, viewer } = context;
  assertSellerSide(context, order);
  assertVersion(order, body.expected_version);
  if (order.status !== "CONFIRMED" || order.delivery_method !== "COD") {
    conflict("INVALID_ORDER_TRANSITION", "Chỉ gửi được đơn COD đã xác nhận.");
  }

  const now = new Date().toISOString();
  order.delivery.carrier = body.carrier?.trim() || "Đơn vị vận chuyển";
  order.delivery.tracking_code = body.tracking_code?.trim() || null;
  pushHistory(order, {
    to_status: "SHIPPING",
    actor_type: "USER",
    actor_name: viewer.full_name,
    reason: null,
    created_at: now,
  });
  order.shipped_at = now;
  notify(context.database, order.buyer_id, {
    type: "ORDER_SHIPPED",
    title: "Đơn hàng đang được giao",
    content: `Đơn #${order.code} đã được gửi${order.delivery.tracking_code ? ` (mã ${order.delivery.tracking_code})` : ""}.`,
    reference_type: "order",
    reference_id: order.id,
  });
}

/**
 * Delivery confirmation: buyer can confirm directly from CONFIRMED+MEETUP or
 * SHIPPING; the seller side additionally needs the buyer's confirmation
 * (detail-project 9).
 */
function canDeliver(context: TransitionContext): void {
  const { order, body, viewer } = context;
  const isBuyer = order.buyer_id === viewer.id;
  const isSeller = order.seller_id === viewer.id;
  if (!isBuyer && !isSeller) forbidden();
  assertVersion(order, body.expected_version);

  const buyerPath = isBuyer && order.status === "CONFIRMED" && order.delivery_method === "MEETUP";
  const shippingPath = order.status === "SHIPPING";
  if (!buyerPath && !shippingPath) {
    conflict("INVALID_ORDER_TRANSITION", "Đơn chưa ở bước giao hàng.");
  }
  if (isSeller && !body.buyer_confirmed_received) {
    validationError("Cần xác nhận của người mua trước khi ghi nhận đã giao.", {
      buyer_confirmed_received: "Bắt buộc.",
    });
  }

  const now = new Date().toISOString();
  pushHistory(order, {
    to_status: "DELIVERED",
    actor_type: "USER",
    actor_name: viewer.full_name,
    reason: null,
    created_at: now,
  });
  order.delivered_at = now;
  notify(context.database, counterpartyId(order, viewer.id), {
    type: "ORDER_DELIVERED",
    title: "Đã ghi nhận giao hàng",
    content: `Đơn #${order.code} đã được ghi nhận giao. Người mua kiểm tra hàng và xác nhận hoàn tất.`,
    reference_type: "order",
    reference_id: order.id,
  });
}

function canComplete(context: TransitionContext): void {
  const { order, body, viewer } = context;
  assertBuyerSide(context, order);
  assertVersion(order, body.expected_version);
  if (order.status !== "DELIVERED") {
    conflict("INVALID_ORDER_TRANSITION", "Chỉ hoàn tất được đơn đã ghi nhận giao.");
  }
  if (!body.buyer_confirmed_received || !body.buyer_confirmed_paid) {
    validationError("Vui lòng xác nhận đã nhận hàng và đã thanh toán.", {
      confirmations: "Bắt buộc.",
    });
  }
  if (openOrderTicket(context.database, order.id)) {
    conflict(
      "INVALID_ORDER_TRANSITION",
      "Đơn đang được hỗ trợ xử lý nên chưa thể hoàn tất.",
    );
  }

  const now = new Date().toISOString();
  pushHistory(order, {
    to_status: "COMPLETED",
    actor_type: "USER",
    actor_name: viewer.full_name,
    reason: null,
    created_at: now,
  });
  order.completed_at = now;

  for (const item of order.items) {
    const product = findProduct(context.database, item.product_id);
    if (product && product.reserved_order_id === order.id) {
      product.status = "SOLD";
      product.reserved_order_id = null;
      product.version += 1;
      product.updated_at = now;
    }
  }

  notify(context.database, order.seller_id, {
    type: "ORDER_COMPLETED",
    title: "Đơn hàng đã hoàn tất",
    content: `Người mua đã xác nhận hoàn tất đơn #${order.code}.`,
    reference_type: "order",
    reference_id: order.id,
  });
}

export const ordersApi: OrdersApi = {
  async list(query) {
    const viewer = requireActive(currentViewer());
    const database = db();
    const paging = parsePaging({ page: query.page, page_size: 20 });

    let rows = database.orders.filter((order) =>
      query.role === "seller" ? order.seller_id === viewer.id : order.buyer_id === viewer.id,
    );
    if (query.status && query.status !== "ALL") {
      rows = rows.filter((order) => order.status === (query.status as OrderStatus));
    }
    rows = [...rows].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

    const { slice, meta } = paginate(rows, paging);
    return {
      items: slice.map((order) => projectOrderListItem(database, order, viewer)),
      meta,
    };
  },

  async detail(id) {
    const viewer = requireActive(currentViewer());
    const database = db();
    const order = database.orders.find((entry) => entry.id === id);
    if (!order) notFound("Không tìm thấy đơn hàng này.");
    if (
      order.buyer_id !== viewer.id &&
      order.seller_id !== viewer.id &&
      viewer.role !== "ADMIN"
    ) {
      forbidden();
    }
    return projectOrderDetail(database, order, viewer);
  },

  async act(id, action, body) {
    const viewer = requireActive(currentViewer());
    const database = db();
    const order = database.orders.find((entry) => entry.id === id);
    if (!order) notFound("Không tìm thấy đơn hàng này.");
    if (order.buyer_id !== viewer.id && order.seller_id !== viewer.id) forbidden();

    const context: TransitionContext = { database, order, actor: viewer, viewer, body };
    const allowed = new Set<OrderAction>(["confirm", "cancel", "ship", "deliver", "complete"]);
    if (!allowed.has(action)) {
      validationError("Thao tác không hợp lệ cho đơn hàng.");
    }

    switch (action) {
      case "confirm":
        canConfirm(context);
        break;
      case "cancel":
        canCancel(context);
        break;
      case "ship":
        canShip(context);
        break;
      case "deliver":
        canDeliver(context);
        break;
      case "complete":
        canComplete(context);
        break;
      default:
        validationError("Thao tác không hợp lệ cho đơn hàng.");
    }

    return projectOrderDetail(database, order, viewer);
  },
};
