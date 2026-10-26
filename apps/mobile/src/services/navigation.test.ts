import { describe, expect, it } from "vitest";
import { accountNavigation, mainTab, showBottomNavigation } from "./navigation";

describe("mobile web navigation parity", () => {
  it("keeps bottom navigation on account lists and public discovery", () => {
    for (const path of [
      "/",
      "/products",
      "/users/seller",
      "/favorites",
      "/account",
      "/cart",
      "/orders",
      "/messages",
      "/my-products",
      "/notifications",
      "/support",
      "/support/ticket",
    ])
      expect(showBottomNavigation(path)).toBe(true);
    expect(mainTab("/cart")).toBe("account");
    expect(mainTab("/users/seller")).toBe("explore");
    expect(mainTab("/messages")).toBeNull();
  });
  it("leaves room for purchase, listing, chat and order actions", () => {
    for (const path of [
      "/products/product",
      "/checkout",
      "/sell",
      "/edit-product/product",
      "/messages/thread",
      "/orders/order",
      "/login",
      "/register",
      "/admin",
      "/admin/users",
    ])
      expect(showBottomNavigation(path)).toBe(false);
  });
  it("offers both order roles and only accessible account destinations when locked", () => {
    const hrefs = accountNavigation({ status: "LOCKED" }).flatMap((group) =>
      group.items.map((item) => item.href),
    );
    expect(hrefs).toEqual([
      "/account",
      "/orders?role=buyer",
      "/orders?role=seller",
      "/notifications",
      "/support",
    ]);
    expect(
      accountNavigation({ status: "ACTIVE" }).flatMap((group) => group.items)
        .length,
    ).toBe(9);
  });
});
