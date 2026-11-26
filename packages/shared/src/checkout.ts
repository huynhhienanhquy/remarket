import type { CartView, ProductDetail } from "./dto.js";

/** The direct-purchase screen uses the same item shape as checkout from cart. */
export function productAsCart(product: ProductDetail | null): CartView {
  if (product === null) return { groups: [], total_items: 0 };
  return {
    total_items: 1,
    groups: [{
      seller: product.seller,
      items: [{
        product_id: product.id,
        title: product.title,
        price: product.price,
        image_url: product.image_url,
        condition: product.condition,
        status: product.status,
        province_label: product.province_label,
        delivery_method: product.delivery_method,
        shipping_fee: product.shipping_fee,
        available: product.capabilities.can_buy,
        unavailable_reason: product.capabilities.unavailable_reason,
      }],
    }],
  };
}
