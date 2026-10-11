import { createHash } from "node:crypto";
import { z } from "zod";
import { validationError } from "../shared/errors.js";

export const MAX_CHECKOUT_ITEMS = 50;

export const checkoutItemSchema = z
  .object({
    product_id: z.string().uuid("Mã sản phẩm không hợp lệ."),
    expected_price: z.string().regex(/^\d+$/, "Giá phải là số nguyên VND."),
  })
  .strict();

export const checkoutDeliverySchema = z
  .object({
    seller_id: z.string().uuid("Mã người bán không hợp lệ."),
    method: z.enum(["COD", "MEETUP"]),
    recipient_name: z
      .string()
      .trim()
      .min(1, "Tên người nhận không được để trống.")
      .max(100, "Tên người nhận tối đa 100 ký tự."),
    recipient_phone: z.string().trim().regex(/^\d{9,11}$/, "Số điện thoại gồm 9–11 chữ số."),
    delivery_address: z
      .string()
      .trim()
      .min(1, "Vui lòng nhập địa chỉ nhận hàng hoặc địa điểm gặp.")
      .max(300, "Địa chỉ tối đa 300 ký tự."),
    expected_shipping_fee: z.string().regex(/^\d+$/, "Phí vận chuyển phải là số nguyên VND."),
  })
  .strict();

export const checkoutPayloadSchema = z
  .object({
    items: z
      .array(checkoutItemSchema)
      .min(1, "Chưa chọn sản phẩm để đặt hàng.")
      .max(MAX_CHECKOUT_ITEMS, `Tối đa ${MAX_CHECKOUT_ITEMS} sản phẩm mỗi đơn.`),
    deliveries: z
      .array(checkoutDeliverySchema)
      .min(1, "Thiếu thông tin giao nhận.")
      .max(MAX_CHECKOUT_ITEMS, `Tối đa ${MAX_CHECKOUT_ITEMS} thông tin giao nhận.`),
  })
  .strict();

export type CheckoutItemInput = z.infer<typeof checkoutItemSchema>;

export type CheckoutDeliveryInput = z.infer<typeof checkoutDeliverySchema>;

export type CheckoutPayloadInput = z.infer<typeof checkoutPayloadSchema>;

export function byIdAsc(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

export interface NormalizedPayload {
  items: CheckoutItemInput[];
  deliveries: CheckoutDeliveryInput[];
  hash: string;
}

/**
 * Sorts items by `product_id` and deliveries by `seller_id`, rejects duplicates
 * and hashes the canonical JSON with SHA-256 — the same payload retried under
 * the same idempotency key always produces the same hash.
 */
export function normalizePayload(payload: CheckoutPayloadInput): NormalizedPayload {
  const items = [...payload.items].sort((a, b) => byIdAsc(a.product_id, b.product_id));
  for (let index = 1; index < items.length; index += 1) {
    if (items[index]!.product_id === items[index - 1]!.product_id) {
      throw validationError("Có sản phẩm bị lặp trong giỏ hàng.", {
        items: "Mỗi sản phẩm chỉ xuất hiện một lần.",
      });
    }
  }

  const deliveries = [...payload.deliveries].sort((a, b) => byIdAsc(a.seller_id, b.seller_id));
  for (let index = 1; index < deliveries.length; index += 1) {
    if (deliveries[index]!.seller_id === deliveries[index - 1]!.seller_id) {
      throw validationError("Mỗi người bán chỉ cần một thông tin giao nhận.", {
        deliveries: "Trùng người bán.",
      });
    }
  }

  const canonical = JSON.stringify({
    items: items.map((item) => ({
      product_id: item.product_id,
      expected_price: item.expected_price,
    })),
    deliveries: deliveries.map((delivery) => ({
      seller_id: delivery.seller_id,
      method: delivery.method,
      recipient_name: delivery.recipient_name,
      recipient_phone: delivery.recipient_phone,
      delivery_address: delivery.delivery_address,
      expected_shipping_fee: delivery.expected_shipping_fee,
    })),
  });

  return {
    items,
    deliveries,
    hash: createHash("sha256").update(canonical, "utf8").digest("hex"),
  };
}
