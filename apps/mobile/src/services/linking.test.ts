import { describe, expect, it } from "vitest";
import {
  notificationRoute,
  loginReturnRoute,
  destinationAfterLogin,
} from "./linking";
describe("push navigation", () => {
  const id = "00000000-0000-0000-0000-000000000001";
  it("accepts supported references only", () => {
    expect(notificationRoute("order", id)).toBe(`/orders/${id}`);
    expect(notificationRoute("conversation", id)).toBe(`/messages/${id}`);
  });
  it("ignores arbitrary URLs and unknown reference types", () => {
    expect(notificationRoute("order", "https://evil.example")).toBeNull();
    expect(notificationRoute("admin", id)).toBeNull();
    expect(notificationRoute("order", null)).toBeNull();
  });
  it("returns to the authorized app route after login and rejects external redirects", () => {
    expect(loginReturnRoute(`/orders/${id}`)).toBe(`/orders/${id}`);
    expect(loginReturnRoute("/cart")).toBe("/cart");
    expect(loginReturnRoute("https://evil.example")).toBe("/(tabs)");
    expect(loginReturnRoute("/admin")).toBe("/admin");
    expect(loginReturnRoute("/admin/products")).toBe("/admin/products");
    expect(loginReturnRoute("/admin/unknown")).toBe("/(tabs)");
  });
  it("preserves only validated checkout and support context", () => {
    expect(loginReturnRoute(`/checkout?product_id=${id}`)).toBe(
      `/checkout?product_id=${id}`,
    );
    expect(loginReturnRoute(`/support/new?order_id=${id}`)).toBe(
      `/support/new?order_id=${id}`,
    );
    expect(loginReturnRoute("/orders?role=seller")).toBe("/orders?role=seller");
    for (const path of [
      "//evil.example",
      "/checkout?product_id=https://evil.example",
      `/checkout?product_id=${id}&redirect=https://evil.example`,
      "/orders?role=admin",
      `/checkout?product_id=${id}&product_id=${id}`,
    ])
      expect(loginReturnRoute(path)).toBe("/(tabs)");
  });
  it("routes admins and restricted accounts according to their server identity", () => {
    expect(
      destinationAfterLogin({ role: "ADMIN", status: "ACTIVE" }, undefined),
    ).toBe("/admin");
    expect(
      destinationAfterLogin({ role: "USER", status: "ACTIVE" }, "/admin/users"),
    ).toBe("/(tabs)");
    expect(
      destinationAfterLogin({ role: "USER", status: "LOCKED" }, "/checkout"),
    ).toBe("/orders");
    expect(
      destinationAfterLogin(
        { role: "USER", status: "LOCKED" },
        `/support/${id}`,
      ),
    ).toBe(`/support/${id}`);
    expect(
      destinationAfterLogin(
        { role: "ADMIN", status: "ACTIVE" },
        `/products/${id}`,
      ),
    ).toBe(`/products/${id}`);
  });
});
