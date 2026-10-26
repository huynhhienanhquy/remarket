import type { CartView } from "@remarket/shared";

/** Malformed selection must never buy the whole cart. */
export function checkoutSelection(input: unknown): string[] | null {
  if (input === undefined) return null;
  if (typeof input !== "string" || !input) return [];
  const ids = input.split(",");
  if (
    ids.length > 50 ||
    ids.some(
      (id) =>
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          id,
        ),
    )
  )
    return [];
  return [...new Set(ids)];
}

export function selectedCart(cart: CartView, ids: string[] | null): CartView {
  if (ids === null) return cart;
  const groups = cart.groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => ids.includes(item.product_id)),
    }))
    .filter((group) => group.items.length > 0);
  return {
    groups,
    total_items: groups.reduce((sum, group) => sum + group.items.length, 0),
  };
}
