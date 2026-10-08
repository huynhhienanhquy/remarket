import type { CheckoutPayload, OrderDeliveryMethod } from "@remarket/shared";
import type { CheckoutApi } from "../lib/api/contract";
import { currentViewer } from "./adapter-auth";
import { notify } from "./adapter-notify";
import { db } from "./store";
import {
  conflict,
  findProduct,
  isPubliclyVisible,
  requireVerified,
  validationError,
} from "./adapter-helpers";
import { projectOrderListItem } from "./adapter-order-view";
import type { MockOrder, MockProduct } from "./types";

const MAX_ORDER_WAIT_MS = 24 * 60 * 60 * 1000;

function methodsOf(product: MockProduct): Set<OrderDeliveryMethod> {
  if (product.delivery_method === "BOTH") return new Set(["COD", "MEETUP"]);
  return new Set([product.delivery_method]);
}

function hashPayload(payload: CheckoutPayload): string {
  const normalized = {
    items: [...payload.items]
      .map((item) => ({ product_id: item.product_id, expected_price: item.expected_price }))
      .sort((a, b) => (a.product_id < b.product_id ? -1 : 1)),
    deliveries: [...payload.deliveries]
      .map((delivery) => ({
        seller_id: delivery.seller_id,
        method: delivery.method,
        recipient_name: delivery.recipient_name,
        recipient_phone: delivery.recipient_phone,
        delivery_address: delivery.delivery_address,
        expected_shipping_fee: delivery.expected_shipping_fee,
      }))
      .sort((a, b) => (a.seller_id < b.seller_id ? -1 : 1)),
  };
  return JSON.stringify(normalized);
}

function simpleHash(value: string): string {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) + hash + value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(16);
}

/**
 * Multi-seller checkout (detail-project 8.1): one order per seller, hold every
 * product with a conditional update, all-or-nothing. The mock validates fully
 * before mutating so a late failure cannot leave a partial state behind.
 */
export const checkoutApi: CheckoutApi = {
  async create(payload, idempotencyKey) {
    const viewer = requireVerified(currentViewer());
    const database = db();

    if (!idempotencyKey) validationError("Thiếu mã idempotency cho yêu cầu đặt hàng.");
    if (!payload.items || payload.items.length === 0) {
      validationError("Chưa chọn sản phẩm để đặt hàng.");
    }
    if (!payload.deliveries || payload.deliveries.length === 0) {
      validationError("Thiếu thông tin giao nhận.");
    }

    const requestHash = simpleHash(hashPayload(payload));
    const existing = database.checkout_requests.find(
      (entry) => entry.buyer_id === viewer.id && entry.idempotency_key === idempotencyKey,
    );
    if (existing) {
      if (existing.request_hash !== requestHash) {
        conflict(
          "IDEMPOTENCY_CONFLICT",
          "Yêu cầu này khác với lần gửi trước cho cùng một mã idempotency.",
        );
      }
      const orders = database.orders.filter((entry) => entry.checkout_request_id === existing.id);
      return {
        checkout_request_id: existing.id,
        orders: orders.map((order) => projectOrderListItem(database, order, viewer)),
      };
    }

    // Deterministic demo scenario: report the new price once, then succeed.
    const queuedChanges = database.price_change_queue.filter((entry) =>
      payload.items.some((item) => item.product_id === entry.product_id),
    );
    if (queuedChanges.length > 0) {
      for (const change of queuedChanges) {
        const product = findProduct(database, change.product_id);
        if (product) {
          product.price = change.new_price;
          product.version += 1;
          product.updated_at = new Date().toISOString();
        }
      }
      database.price_change_queue = database.price_change_queue.filter(
        (entry) => !queuedChanges.some((change) => change.product_id === entry.product_id),
      );
      conflict("PRICE_CHANGED", "Giá của món đồ vừa thay đổi, vui lòng xác nhận lại.", {
        items: queuedChanges.map((change) => ({
          product_id: change.product_id,
          price: change.new_price,
        })),
      });
    }

    const unavailable: string[] = [];
    const priceChanges: Array<{ product_id: string; price: string }> = [];
    const selected: MockProduct[] = [];

    for (const item of payload.items) {
      const product = findProduct(database, item.product_id);
      if (
        !product ||
        !isPubliclyVisible(database, product) ||
        product.seller_id === viewer.id ||
        product.status !== "ACTIVE"
      ) {
        unavailable.push(item.product_id);
        continue;
      }
      if (item.expected_price !== product.price) {
        priceChanges.push({ product_id: product.id, price: product.price });
      }
      selected.push(product);
    }

    if (unavailable.length > 0) {
      conflict("PRODUCT_NOT_AVAILABLE", "Sản phẩm không còn khả dụng.", {
        product_ids: unavailable,
      });
    }
    if (priceChanges.length > 0) {
      conflict("PRICE_CHANGED", "Giá của món đồ vừa thay đổi, vui lòng xác nhận lại.", {
        items: priceChanges,
      });
    }

    const groups = new Map<string, MockProduct[]>();
    for (const product of selected) {
      const bucket = groups.get(product.seller_id) ?? [];
      bucket.push(product);
      groups.set(product.seller_id, bucket);
    }

    const deliveryBySeller = new Map(payload.deliveries.map((entry) => [entry.seller_id, entry]));
    if (deliveryBySeller.size !== groups.size) {
      validationError("Thông tin giao nhận chưa khớp với nhóm người bán đã chọn.");
    }

    for (const [sellerId, items] of groups) {
      const delivery = deliveryBySeller.get(sellerId);
      if (!delivery) {
        validationError("Thiếu thông tin giao nhận cho một số người bán.");
      }
      if (delivery.recipient_name.trim() === "" || delivery.recipient_name.length > 100) {
        validationError("Tên người nhận không hợp lệ.", { recipient_name: "Tên không hợp lệ." });
      }
      if (!/^\d{9,11}$/.test(delivery.recipient_phone.trim())) {
        validationError("Số điện thoại người nhận không hợp lệ.", {
          recipient_phone: "Số điện thoại gồm 9–11 chữ số.",
        });
      }
      if (delivery.delivery_address.trim() === "") {
        validationError("Vui lòng nhập địa chỉ nhận hàng hoặc địa điểm gặp.", {
          delivery_address: "Bắt buộc.",
        });
      }

      // Every item in the group must support the chosen method.
      const common = items.reduce<Set<OrderDeliveryMethod>>((intersection, product) => {
        const methods = methodsOf(product);
        return new Set([...intersection].filter((method) => methods.has(method)));
      }, new Set(["COD", "MEETUP"]));

      if (!common.has(delivery.method)) {
        conflict(
          "VALIDATION_ERROR",
          "Các món này chưa có hình thức giao nhận chung. Vui lòng điều chỉnh sản phẩm.",
          { seller_id: sellerId, supported: [...common] },
        );
      }
    }

    const requestId = `0000000b-0000-4000-8000-${(database.checkout_requests.length + 300)
      .toString(16)
      .padStart(12, "0")}`;
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + MAX_ORDER_WAIT_MS).toISOString();

    database.checkout_requests.push({
      id: requestId,
      buyer_id: viewer.id,
      idempotency_key: idempotencyKey,
      request_hash: requestHash,
      created_at: now,
    });

    const created: MockOrder[] = [];
    for (const [sellerId, items] of groups) {
      const delivery = deliveryBySeller.get(sellerId)!;
      const subtotal = items
        .reduce((sum, product) => sum + BigInt(product.price), 0n)
        .toString();
      const shippingFee =
        delivery.method === "MEETUP"
          ? "0"
          : items.reduce(
              (max, product) =>
                BigInt(product.shipping_fee) > BigInt(max) ? product.shipping_fee : max,
              "0",
            )
            .toString();

      const orderId = `00000004-0000-4000-8000-${(database.orders.length + 400)
        .toString(16)
        .padStart(12, "0")}`;

      const order: MockOrder = {
        id: orderId,
        code: `RM${orderId.slice(-8).toUpperCase()}`,
        checkout_request_id: requestId,
        buyer_id: viewer.id,
        seller_id: sellerId,
        subtotal,
        shipping_fee: shippingFee,
        total_amount: (BigInt(subtotal) + BigInt(shippingFee)).toString(),
        currency: "VND",
        delivery_method: delivery.method,
        delivery: {
          recipient_name: delivery.recipient_name.trim(),
          recipient_phone: delivery.recipient_phone.trim(),
          delivery_address: delivery.delivery_address.trim(),
          carrier: null,
          tracking_code: null,
        },
        status: "PENDING",
        version: 1,
        expires_at: expiresAt,
        confirmed_at: null,
        shipped_at: null,
        delivered_at: null,
        completed_at: null,
        cancelled_at: null,
        cancelled_by: null,
        cancellation_reason: null,
        created_at: now,
        updated_at: now,
        items: items.map((product, index) => ({
          id: `${orderId}-item-${index}`,
          product_id: product.id,
          title_snapshot: product.title,
          condition_snapshot: product.condition,
          image_path_snapshot: product.images[0]?.url ?? null,
          image_url: product.images[0]?.url ?? null,
          price: product.price,
        })),
        status_history: [
          {
            from_status: null,
            to_status: "PENDING",
            actor_type: "USER",
            actor_name: viewer.full_name,
            reason: null,
            created_at: now,
          },
        ],
      };

      // Conditional hold: only an ACTIVE, unblocked, unsold listing can move to
      // RESERVED for this exact order (detail-project 8.1 step 4).
      for (const product of items) {
        if (product.status !== "ACTIVE" || product.is_blocked || product.deleted_at !== null) {
          conflict("PRODUCT_NOT_AVAILABLE", "Sản phẩm không còn khả dụng.", {
            product_ids: items.map((entry) => entry.id),
          });
        }
      }
      for (const product of items) {
        product.status = "RESERVED";
        product.reserved_order_id = orderId;
        product.version += 1;
        product.updated_at = now;
      }

      database.cart_items = database.cart_items.filter(
        (item) =>
          !(item.user_id === viewer.id && items.some((product) => product.id === item.product_id)),
      );

      database.orders.push(order);
      created.push(order);

      notify(database, sellerId, {
        type: "ORDER_CREATED",
        title: "Có đơn hàng mới",
        content: `${viewer.full_name} vừa đặt ${items.length} món hàng, chờ bạn xác nhận.`,
        reference_type: "order",
        reference_id: orderId,
      });
    }

    return {
      checkout_request_id: requestId,
      orders: created.map((order) => projectOrderListItem(database, order, viewer)),
    };
  },
};
