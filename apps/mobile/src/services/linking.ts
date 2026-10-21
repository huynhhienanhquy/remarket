import type { SessionUser } from "@remarket/shared";

const idPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function notificationRoute(type: unknown, id: unknown): string | null {
  if (typeof id !== "string" || !idPattern.test(id)) return null;
  const routes: Record<string, string> = {
    product: "products",
    order: "orders",
    conversation: "messages",
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
    const order = params.get("order_id");
    const role = params.get("role");
    if (path === "/checkout" && product && idPattern.test(product))
      return `/checkout?product_id=${product}`;
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
