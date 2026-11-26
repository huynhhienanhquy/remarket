export function checkoutBackLink(productId: string | null) {
  return productId
    ? { label: "Quay lại sản phẩm", to: `/products/${encodeURIComponent(productId)}` }
    : { label: "Quay lại giỏ hàng", to: "/cart" };
}
