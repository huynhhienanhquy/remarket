import {
  orderShippingFee,
  validateFullName,
  validatePhone,
} from "@remarket/shared";
import type {
  CartView,
  CheckoutDeliveryInput,
  CheckoutPayload,
  SessionUser,
} from "@remarket/shared";

export function buildCheckoutPayload(
  cart: CartView,
  excluded: string[],
  deliveries: Record<string, Partial<CheckoutDeliveryInput>>,
  user: Pick<SessionUser, "full_name" | "phone" | "default_address">,
): CheckoutPayload {
  const groups = cart.groups
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) => item.available && !excluded.includes(item.product_id),
      ),
    }))
    .filter((group) => group.items.length);
  const items = groups.flatMap((group) =>
    group.items.map((item) => ({
      product_id: item.product_id,
      expected_price: item.price,
    })),
  );
  if (!items.length) throw new Error("Chưa chọn sản phẩm để đặt hàng.");
  if (items.length > 50)
    throw new Error("Mỗi lần đặt hàng tối đa 50 sản phẩm.");
  return {
    items,
    deliveries: groups.map((group) => {
      const draft = deliveries[group.seller.id] ?? {};
      const methods = (["COD", "MEETUP"] as const).filter((method) =>
        group.items.every(
          (item) =>
            item.delivery_method === "BOTH" || item.delivery_method === method,
        ),
      );
      const method = draft.method ?? methods[0];
      if (!method || !methods.includes(method))
        throw new Error(
          `Hãy chọn các món có chung hình thức giao nhận từ ${group.seller.name}.`,
        );
      const recipient_name = (draft.recipient_name ?? user.full_name).trim();
      const recipient_phone = (
        draft.recipient_phone ??
        user.phone ??
        ""
      ).trim();
      const delivery_address = (
        draft.delivery_address ??
        user.default_address ??
        ""
      ).trim();
      const problem =
        validateFullName(recipient_name) || validatePhone(recipient_phone);
      if (problem) throw new Error(`${group.seller.name}: ${problem}`);
      if (!delivery_address || delivery_address.length > 300)
        throw new Error(
          `${group.seller.name}: Nhập địa chỉ / địa điểm gặp từ 1 đến 300 ký tự.`,
        );
      return {
        seller_id: group.seller.id,
        method,
        recipient_name,
        recipient_phone,
        delivery_address,
        expected_shipping_fee: orderShippingFee(
          method,
          group.items.map((item) => item.shipping_fee),
        ),
      };
    }),
  };
}
