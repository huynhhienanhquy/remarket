import { describe, expect, it } from "vitest";
import { ApiError, apiFieldErrors } from "./errors";

describe("API field errors shared by all forms", () => {
  it("accepts both normalized fields and the original error envelope", () => {
    const base = { code: "VALIDATION_ERROR", status: 422, message: "Invalid form" };
    expect(apiFieldErrors(new ApiError({ ...base, fields: { email: "Email đã được sử dụng." } })))
      .toEqual({ email: "Email đã được sử dụng." });
    expect(apiFieldErrors(new ApiError({ ...base, details: { fields: { phone: "Số điện thoại chưa hợp lệ." } } })))
      .toEqual({ phone: "Số điện thoại chưa hợp lệ." });
  });

  it("does not display array entries, empty messages or non-string response values as field errors", () => {
    const error = (fields: unknown) => new ApiError({ code: "VALIDATION_ERROR", status: 422,
      message: "Invalid form", details: { fields } });
    expect(apiFieldErrors(error(["not a field map"]))).toBeUndefined();
    expect(apiFieldErrors(error({ email: "", phone: null, name: 123 }))).toBeUndefined();
    expect(apiFieldErrors(error({ email: "Email chưa hợp lệ.", ignored: false })))
      .toEqual({ email: "Email chưa hợp lệ." });
    expect(apiFieldErrors(new Error("Network unavailable"))).toBeUndefined();
  });
});
