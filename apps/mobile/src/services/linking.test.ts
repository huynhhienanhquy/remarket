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
  it("opens moderation, support and system notifications in the correct account area", () => {
    const admin = { role: "ADMIN", status: "ACTIVE" } as const;
    const member = { role: "USER", status: "ACTIVE" } as const;
    expect(notificationRoute("product", id, member)).toBe("/my-products");
    expect(notificationRoute("email_verification", id, admin)).toBe(
      "/admin/email-verifications",
    );
    expect(notificationRoute("account", id, member)).toBe("/account");
    expect(notificationRoute("ticket", id, admin)).toBe("/admin/support");
    expect(notificationRoute("ticket", id, member)).toBe(`/support/${id}`);
    expect(notificationRoute("message", id, member)).toBe(`/messages/${id}`);
    expect(notificationRoute("report", id, member)).toBe("/reports");
    expect(notificationRoute("report", id, admin)).toBe("/admin/reports");
    expect(
      notificationRoute("product", id, { role: "USER", status: "LOCKED" }),
    ).toBe("/account");
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
    expect(loginReturnRoute(`/checkout?items=${id}`)).toBe(
      `/checkout?items=${id}`,
    );
    for (const path of [
      "//evil.example",
      "/checkout?product_id=https://evil.example",
      `/checkout?product_id=${id}&redirect=https://evil.example`,
      "/orders?role=admin",
      `/checkout?product_id=${id}&product_id=${id}`,
      "/checkout?items=invalid",
      `/checkout?items=${id}&redirect=https://evil.example`,
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
