import { describe, expect, it } from "vitest";
import { validateChatMessage, validatePassword, validatePhone, validateReportDescription, validateReviewComment } from "./validation.js";
import { isRouteAllowedWhenLocked } from "./policy.js";

describe("validatePassword", () => {
  it("requires at least 12 characters", () => {
    expect(validatePassword("short")).toBeTruthy();
    expect(validatePassword("123456789012")).toBeNull();
  });
});

describe("validatePhone", () => {
  it("accepts 9–11 digit phone numbers only", () => {
    expect(validatePhone("0912345678")).toBeNull();
    expect(validatePhone("912345678")).toBeNull();
    expect(validatePhone("123")).toBeTruthy();
    expect(validatePhone("")).toBeTruthy();
    expect(validatePhone("+84912345678")).toBeTruthy();
  });
});

describe("validateReviewComment", () => {
  it("allows empty comments but caps length", () => {
    expect(validateReviewComment("")).toBeNull();
    expect(validateReviewComment(" ".repeat(5))).toBeNull();
    expect(validateReviewComment("x".repeat(1001))).toBeTruthy();
  });
});

describe("validateReportDescription", () => {
  it("requires a description only for OTHER", () => {
    expect(validateReportDescription("", "SPAM")).toBeNull();
    expect(validateReportDescription("", "OTHER")).toBeTruthy();
    expect(validateReportDescription("chi tiết", "OTHER")).toBeNull();
    expect(validateReportDescription("x".repeat(2001), "SPAM")).toBeTruthy();
  });
});

describe("validateChatMessage", () => {
  it("flags over-long messages and leaves emptiness to the caller", () => {
    // Blank/short messages are rejected by the composer + adapter, not here.
    expect(validateChatMessage("")).toBeNull();
    expect(validateChatMessage("hello")).toBeNull();
    expect(validateChatMessage("x".repeat(2001))).toBeTruthy();
  });
});

describe("isRouteAllowedWhenLocked", () => {
  it("keeps locked accounts on orders, support and notifications", () => {
    expect(isRouteAllowedWhenLocked("/orders")).toBe(true);
    expect(isRouteAllowedWhenLocked("/orders/abc")).toBe(true);
    expect(isRouteAllowedWhenLocked("/support")).toBe(true);
    expect(isRouteAllowedWhenLocked("/support/new")).toBe(true);
    expect(isRouteAllowedWhenLocked("/notifications")).toBe(true);
  });

  it("blocks marketplace and selling routes", () => {
    expect(isRouteAllowedWhenLocked("/")).toBe(false);
    expect(isRouteAllowedWhenLocked("/account/products/new")).toBe(false);
    expect(isRouteAllowedWhenLocked("/cart")).toBe(false);
    expect(isRouteAllowedWhenLocked("/messages")).toBe(false);
  });
});

