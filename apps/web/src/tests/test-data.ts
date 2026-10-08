import type { ProductDetail, SessionUser, SellerSummary, SupportTicketDetail } from "@remarket/shared";

export const timestamp = "2026-10-08T00:00:00.000Z";
export const member: SessionUser = {
  id: "member-test", full_name: "Người mua kiểm thử", email: "member@example.test",
  avatar_url: null, role: "USER", status: "ACTIVE", email_verified_at: timestamp,
  phone: "0900000000", province_code: "VN-01", default_address: "1 Đường kiểm thử, Hà Nội", joined_at: timestamp,
};
export const seller: SellerSummary = {
  id: "seller-test", name: "Người bán kiểm thử", avatar_url: null,
  province_code: "VN-01", province_label: "Hà Nội", joined_at: timestamp,
  rating: null, review_count: 0, completed_sales_count: 0,
};
export const product: ProductDetail = {
  id: "product-test", title: "Sản phẩm kiểm thử", price: "100000", image_url: null,
  condition: "GOOD", province_code: "VN-01", province_label: "Hà Nội",
  published_at: timestamp, created_at: timestamp, status: "ACTIVE",
  is_favorited: false, seller, description: "Mô tả sản phẩm kiểm thử",
  images: [], category_id: "category-test", category_path: ["Danh mục kiểm thử"],
  usage_months: 12, delivery_method: "COD", shipping_fee: "30000", version: 1,
  is_blocked: false, block_reason: null, rejection_reason: null,
  capabilities: { can_buy: true, can_add_to_cart: true, can_chat: true, can_favorite: true,
    can_report: true, can_edit: false, can_manage: false, unavailable_reason: null },
};
export const ticket: SupportTicketDetail = {
  id: "ticket-test", code: "TKT-TEST", subject: "Cần hỗ trợ tài khoản", type: "ACCOUNT",
  status: "OPEN", order_id: null, created_at: timestamp, updated_at: timestamp,
  resolution_note: null, resolved_at: null, closed_at: null, assigned_admin_name: null,
  messages: [], allowed_actions: ["reply", "close"],
};
