import type { SessionUser } from "@remarket/shared";
import type { ComponentProps } from "react";
import type Ionicons from "@expo/vector-icons/Ionicons";

interface NavigationGroup {
  title: string;
  items: {
    title: string;
    icon: ComponentProps<typeof Ionicons>["name"];
    href: string;
  }[];
}

export type MainTab = "explore" | "favorites" | "sell" | "account";

export function mainTab(pathname: string): MainTab | null {
  if (
    pathname === "/" ||
    pathname === "/products" ||
    pathname.startsWith("/users/")
  )
    return "explore";
  if (pathname === "/favorites") return "favorites";
  if (pathname === "/sell") return "sell";
  if (
    [
      "/account",
      "/cart",
      "/orders",
      "/my-products",
      "/notifications",
      "/support",
      "/blocks",
      "/reports",
    ].some((path) => pathname === path || pathname.startsWith(`${path}/`))
  )
    return "account";
  return null;
}

export function showBottomNavigation(pathname: string): boolean {
  return (
    (mainTab(pathname) !== null || pathname === "/messages") &&
    pathname !== "/sell" &&
    !/^\/orders\/[^/]+$/.test(pathname)
  );
}

/** Mirrors account links on the web; restricted accounts keep their order/support access. */
export function accountNavigation(
  user: Pick<SessionUser, "status">,
): NavigationGroup[] {
  const locked = user.status === "LOCKED";
  const groups: NavigationGroup[] = [
    {
      title: "Tài khoản",
      items: [
        { title: "Hồ sơ cá nhân", icon: "person-outline", href: "/account" },
      ],
    },
    {
      title: "Mua sắm",
      items: [
        { title: "Yêu thích", icon: "heart-outline", href: "/favorites" },
        { title: "Giỏ hàng", icon: "cart-outline", href: "/cart" },
        {
          title: "Đơn mua",
          icon: "bag-handle-outline",
          href: "/orders?role=buyer",
        },
      ],
    },
    {
      title: "Bán hàng",
      items: [
        {
          title: "Tin đăng của tôi",
          icon: "pricetags-outline",
          href: "/my-products",
        },
        {
          title: "Đơn bán",
          icon: "receipt-outline",
          href: "/orders?role=seller",
        },
      ],
    },
    {
      title: "Giao tiếp",
      items: [
        { title: "Tin nhắn", icon: "chatbubbles-outline", href: "/messages" },
        {
          title: "Thông báo",
          icon: "notifications-outline",
          href: "/notifications",
        },
        { title: "Hỗ trợ", icon: "help-circle-outline", href: "/support" },
      ],
    },
  ];
  return locked
    ? groups.map((group) => ({
        ...group,
        items: group.items.filter(
          (item) =>
            ["/account", "/notifications", "/support"].includes(item.href) ||
            item.href.startsWith("/orders?"),
        ),
      }))
    : groups;
}
