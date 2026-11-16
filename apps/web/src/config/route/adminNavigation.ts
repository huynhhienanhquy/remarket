import type { IconName } from "../../components/common/Icon/Icon";

export const ADMIN_NAVIGATION: Array<{ to: string; label: string; icon: IconName; group: string; end?: boolean }> = [
  { to: "/admin", label: "Tổng quan", icon: "dashboard", group: "Vận hành", end: true },
  { to: "/admin/products", label: "Sản phẩm", icon: "archive", group: "Vận hành" },
  { to: "/admin/categories", label: "Danh mục", icon: "shapes", group: "Vận hành" },
  { to: "/admin/users", label: "Người dùng", icon: "users", group: "Cộng đồng" },
  { to: "/admin/email-verifications", label: "Xác minh email", icon: "mail-check", group: "Cộng đồng" },
  { to: "/admin/reviews", label: "Đánh giá", icon: "star", group: "Cộng đồng" },
  { to: "/admin/reports", label: "Báo cáo", icon: "flag", group: "Xử lý" },
  { to: "/admin/support", label: "Hỗ trợ", icon: "headset", group: "Xử lý" },
  { to: "/admin/audit", label: "Nhật ký", icon: "history", group: "Xử lý" },
];
