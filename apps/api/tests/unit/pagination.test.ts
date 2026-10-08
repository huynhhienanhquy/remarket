import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { pageMeta, parsePaging, parsePagingOnly } from "../../src/shared/pagination.js";

describe("pagination contract", () => {
  it("uses documented defaults only when parameters are absent", () => {
    expect(parsePaging({})).toEqual({ page: 1, page_size: 20 });
    expect(parsePaging({ page: "2", page_size: "100" })).toEqual({ page: 2, page_size: 100 });
  });

  it("rejects malformed, fractional and out-of-range parameters", () => {
    for (const query of [
      { page: "abc" },
      { page: "0" },
      { page: "1.5" },
      { page_size: "101" },
      { page_size: ["20"] },
    ]) {
      expect(() => parsePaging(query)).toThrow(ZodError);
    }
  });

  it("rejects unknown keys on pagination-only endpoints", () => {
    expect(() => parsePagingOnly({ page: "1", unexpected: "ignored-before" })).toThrow(ZodError);
    expect(parsePagingOnly({ page: "2", page_size: "10" })).toEqual({ page: 2, page_size: 10 });
  });

  it("keeps an empty result at one display page like the frontend adapter", () => {
    expect(pageMeta({ page: 1, page_size: 20 }, 0)).toEqual({
      page: 1,
      page_size: 20,
      total: 0,
      total_pages: 1,
    });
  });
});
