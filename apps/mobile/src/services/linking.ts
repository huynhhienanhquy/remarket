import type { SessionUser } from "@remarket/shared";
import { checkoutSelection } from "./checkout-selection";

const idPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function notificationRoute(
  type: unknown,
  id: unknown,
  user?: Pick<SessionUser, "role" | "status"> | null,
): string | null {
  if (typeof id !== "string" || !idPattern.test(id)) return null;
  if (
    user?.status === "LOCKED" &&
    !["order", "ticket", "support", "account"].includes(String(type))
  )
    return "/account";
  if (type === "account") return "/account";
  if (type === "email_verification")
    return user?.role === "ADMIN"
      ? "/admin/email-verifications"
      : "/verify-email";
  if (type === "report")
    return user?.role === "ADMIN" ? "/admin/reports" : "/reports";
  if (type === "product") return "/my-products";
  if ((type === "ticket" || type === "support") && user?.role === "ADMIN")
    return "/admin/support";
  const routes: Record<string, string> = {
    order: "orders",
    conversation: "messages",
    message: "messages",
    ticket: "support",
    support: "support",
  };
  const prefix = typeof type === "string" ? routes[type] : undefined;
  return prefix ? `/${prefix}/${id}` : null;
}

export function loginReturnRoute(input: unknown): string {
  if (typeof input !== "string") return "/(tabs)";
  const [path, query, extra] = input.split("?");
  if (query !== undefined) {
    if (extra !== undefined) return "/(tabs)";
    const params = new URLSearchParams(query);
    if ([...params.keys()].length !== 1) return "/(tabs)";
    const product = params.get("product_id");
    const items = params.get("items");
    const order = params.get("order_id");
    const role = params.get("role");
    if (path === "/checkout" && product && idPattern.test(product))
      return `/checkout?product_id=${product}`;
    if (path === "/checkout" && items && checkoutSelection(items)?.length)
      return `/checkout?items=${items}`;
    if (path === "/support/new" && order && idPattern.test(order))
      return `/support/new?order_id=${order}`;
    if (path === "/orders" && (role === "buyer" || role === "seller"))
      return `/orders?role=${role}`;
    return "/(tabs)";
  }
  const pages = [
    "/cart",
    "/checkout",
    "/orders",
    "/messages",
    "/favorites",
    "/account",
    "/sell",
    "/my-products",
    "/notifications",
    "/blocks",
    "/reports",
    "/admin",
    "/verify-email",
    "/support",
    "/support/new",
  ];
  if (pages.includes(input)) return input;
  if (
    /^\/admin\/(users|products|categories|reports|reviews|support|email-verifications|audit)$/.test(
      input,
    )
  )
    return input;
  const match =
    /^\/(products|users|orders|messages|support|edit-product)\/([^/]+)$/.exec(
      input,
    );
  return match && idPattern.test(match[2]!) ? input : "/(tabs)";
}

export function destinationAfterLogin(
  user: Pick<SessionUser, "role" | "status">,
  input: unknown,
): string {
  const path = loginReturnRoute(input);
  if (user.status === "LOCKED")
    return path === "/notifications" ||
      path.startsWith("/orders") ||
      path.startsWith("/support")
      ? path
      : "/orders";
  if (path.startsWith("/admin") && user.role !== "ADMIN") return "/(tabs)";
  return user.role === "ADMIN" && path === "/(tabs)" ? "/admin" : path;
}
