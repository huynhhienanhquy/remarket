export const adminNavigation = [
  { path: "/admin", title: "Tổng quan", icon: "grid-outline" },
  { path: "/admin/users", title: "Người dùng", icon: "people-outline" },
  {
    path: "/admin/products",
    title: "Sản phẩm và kiểm duyệt",
    icon: "pricetags-outline",
  },
  { path: "/admin/categories", title: "Danh mục", icon: "albums-outline" },
  { path: "/admin/reports", title: "Báo cáo vi phạm", icon: "flag-outline" },
  { path: "/admin/reviews", title: "Đánh giá", icon: "star-outline" },
  { path: "/admin/support", title: "Hỗ trợ", icon: "help-buoy-outline" },
  {
    path: "/admin/email-verifications",
    title: "Xác minh email",
    icon: "mail-outline",
  },
  {
    path: "/admin/audit",
    title: "Nhật ký quản trị",
    icon: "document-text-outline",
  },
] as const;
