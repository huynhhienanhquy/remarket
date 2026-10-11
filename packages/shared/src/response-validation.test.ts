import { describe, expect, it } from "vitest";
import { apiResponseIssue, validApiResponse } from "./response-validation.js";

const envelope = (data: unknown) => ({ success: true, data, meta: { request_id: "test" } });
describe("generated API response contracts", () => {
  it("rejects missing cart delivery fields before cache ingestion and allows additive fields", () => {
    const empty = envelope({ groups: [], total_items: 0, future_field: true });
    expect(validApiResponse("/cart", "GET", 200, empty)).toBe(true);
    expect(apiResponseIssue("/cart", "GET", 200, envelope({ groups: [] }))).toBe("$.data.total_items");
  });
  it("checks primitive types, pagination bounds and nullable session data", () => {
    expect(validApiResponse("/auth/bootstrap", "POST", 200, envelope({ user: null, access_token: null }))).toBe(true);
    expect(validApiResponse("/auth/bootstrap", "POST", 200, envelope({ user: null, access_token: 1 }))).toBe(false);
    expect(validApiResponse("/orders", "GET", 200, envelope({ items: [], meta: { page: 1, page_size: 20, total: 0, total_pages: 1 } }))).toBe(true);
    expect(validApiResponse("/orders", "GET", 200, envelope({ items: [], meta: { page: 0, page_size: 20, total: 0, total_pages: 1 } }))).toBe(false);
  });
  it("requires documented method/status and the expected dynamic response shape", () => {
    expect(validApiResponse("/products/id", "DELETE", 200, envelope({ id: "id" }))).toBe(true);
    expect(validApiResponse("/products/id", "DELETE", 201, envelope({ id: "id" }))).toBe(false);
    expect(apiResponseIssue("/notifications/id/read", "POST", 200, envelope({ unread: 0 }))).toBe("$.data.updated");
  });
});
