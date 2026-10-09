import type { IconName } from "../../components/common";

export interface AccountNavItem {
  to: string;
  label: string;
  icon: IconName;
  end?: boolean;
}

export const ACCOUNT_GROUPS: { title: string; items: AccountNavItem[] }[] = [
  { title: "Tài khoản", items: [{ to: "/account", label: "Hồ sơ cá nhân", icon: "user", end: true }] },
  { title: "Mua sắm", items: [
    { to: "/favorites", label: "Yêu thích", icon: "heart" },
    { to: "/cart", label: "Giỏ hàng", icon: "cart" },
    { to: "/orders", label: "Đơn mua", icon: "inbox" },
  ] },
  { title: "Bán hàng", items: [
    { to: "/account/products", label: "Tin đăng của tôi", icon: "edit" },
    { to: "/sales", label: "Đơn bán", icon: "inbox" },
  ] },
  { title: "Giao tiếp", items: [
    { to: "/messages", label: "Tin nhắn", icon: "chat" },
    { to: "/notifications", label: "Thông báo", icon: "bell" },
    { to: "/support", label: "Hỗ trợ", icon: "info" },
  ] },
];

export const ACCOUNT_ITEMS = ACCOUNT_GROUPS.flatMap((group) => group.items);
