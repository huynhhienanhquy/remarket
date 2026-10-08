import type { IconName } from "../ui";

export const ADMIN_NAVIGATION: Array<{ to: string; label: string; icon: IconName; group: string; end?: boolean }> = [
  { to: "/admin", label: "Tổng quan", icon: "home", group: "Vận hành", end: true },
  { to: "/admin/products", label: "Sản phẩm", icon: "image", group: "Vận hành" },
  { to: "/admin/categories", label: "Danh mục", icon: "menu", group: "Vận hành" },
  { to: "/admin/users", label: "Người dùng", icon: "user", group: "Cộng đồng" },
  { to: "/admin/email-verifications", label: "Xác minh email", icon: "check", group: "Cộng đồng" },
  { to: "/admin/reviews", label: "Đánh giá", icon: "star", group: "Cộng đồng" },
  { to: "/admin/reports", label: "Báo cáo", icon: "alert-triangle", group: "Xử lý" },
  { to: "/admin/support", label: "Hỗ trợ", icon: "chat", group: "Xử lý" },
  { to: "/admin/audit", label: "Nhật ký", icon: "inbox", group: "Xử lý" },
];
