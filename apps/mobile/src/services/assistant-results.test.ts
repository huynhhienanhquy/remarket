import { describe, expect, it } from "vitest";
import { parseAssistantResult } from "./assistant-results";

describe("assistant tool results", () => {
  it("accepts approved FAQ links and rejects unrecognized destinations", () => {
    const source = { id: "RM-F01", title: "Xác minh email", version: "1.0.0" };
    const faq = (href: string) => JSON.stringify({ kind: "faq", sources: [{ ...source, href }] });
    expect(parseAssistantResult(faq("/verify-email"))).toMatchObject({ kind: "faq" });
    expect(parseAssistantResult(faq("https://example.test"))).toBeNull();
    expect(parseAssistantResult(faq("/admin/users"))).toBeNull();
  });

  it("keeps zero-result filters and enforces the product resolver ID limit", () => {
    const result = { kind: "search", total: 0, product_ids: [], labels: ["Hồ Chí Minh"], filters: { province_code: "VN-52", max_price: "7999999" } };
    expect(parseAssistantResult(JSON.stringify(result))).toEqual(result);
    expect(parseAssistantResult(JSON.stringify({
      ...result, product_ids: Array(7).fill("c075fffb-8450-4c83-a88f-23e6601197aa"),
    }))).toBeNull();
  });
});
