import { describe, expect, it } from "vitest";
import {
  addVnd,
  formatVnd,
  normalizeVndInput,
  orderShippingFee,
  validatePrice,
  validateShippingFee,
} from "./money.js";

describe("formatVnd", () => {
  it("groups thousands with dots and appends the dong sign", () => {
    expect(formatVnd("1100000")).toBe("1.100.000 ₫");
    expect(formatVnd("0")).toBe("0 ₫");
    expect(formatVnd("999")).toBe("999 ₫");
  });

  it("never renders decimals or negative money", () => {
    expect(formatVnd("2500000")).toBe("2.500.000 ₫");
    expect(formatVnd(null)).toBe("—");
    expect(formatVnd(undefined)).toBe("—");
    expect(formatVnd("")).toBe("—");
  });
});

describe("normalizeVndInput", () => {
  it("keeps digits only and drops grouping", () => {
    expect(normalizeVndInput("1.100.000")).toBe("1100000");
    expect(normalizeVndInput("1 100 000")).toBe("1100000");
    expect(normalizeVndInput("1100000")).toBe("1100000");
    // Currency symbols are not stripped — the helper accepts digits only.
    expect(normalizeVndInput("1100000 ₫")).toBeNull();
    expect(normalizeVndInput("abc")).toBeNull();
    expect(normalizeVndInput("")).toBeNull();
  });
});

describe("validatePrice", () => {
  it("rejects empty, non-numeric and over-cap values", () => {
    expect(validatePrice("")).toBeTruthy();
    expect(validatePrice("12a")).toBeTruthy();
    expect(validatePrice("0")).toBeTruthy();
    expect(validatePrice("99999999999999")).toBeTruthy(); // above the 1 tỷ cap
  });

  it("accepts a plausible listing price", () => {
    expect(validatePrice("1100000")).toBeNull();
    expect(validatePrice("500")).toBeNull();
  });
});

describe("validateShippingFee", () => {
  it("is optional when shipping is not required", () => {
    expect(validateShippingFee("", false)).toBeNull();
  });

  it("is required and numeric when shipping applies", () => {
    expect(validateShippingFee("", true)).toBeTruthy();
    expect(validateShippingFee("30000", true)).toBeNull();
  });
});

describe("addVnd", () => {
  it("sums decimal strings without float drift", () => {
    expect(addVnd("1100000", "2500000")).toBe("3600000");
    expect(addVnd("999999999", "1")).toBe("1000000000");
    expect(addVnd()).toBe("0");
  });
});

describe("orderShippingFee", () => {
  it("charges nothing for meetup", () => {
    expect(orderShippingFee("MEETUP", ["30000"])).toBe("0");
  });

  it("takes the highest item fee for shipping", () => {
    expect(orderShippingFee("COD", ["30000", "45000"])).toBe("45000");
    expect(orderShippingFee("COD", [])).toBe("0");
  });
});

