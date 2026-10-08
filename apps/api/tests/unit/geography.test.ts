import { describe, expect, it } from "vitest";
import { isKnownProvinceCode } from "../../src/shared/geography.js";

describe("versioned geography", () => {
  it("accepts a code from the shared province dataset", () => {
    expect(isKnownProvinceCode("VN-52")).toBe(true);
  });

  it("rejects stale or arbitrary province codes", () => {
    expect(isKnownProvinceCode("VN-65")).toBe(false);
    expect(isKnownProvinceCode("unknown")).toBe(false);
  });
});
