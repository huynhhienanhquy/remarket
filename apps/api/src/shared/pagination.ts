import type { PageMeta } from "@remarket/shared";
import { z } from "zod";

/** Page size defaults to 20 and is capped at 100 (detail-project 9.2). */
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export interface PageParams {
  page: number;
  page_size: number;
}

const queryInteger = (field: string, maximum?: number) =>
  z.preprocess(
    (value) => {
      if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
      return value;
    },
    z
      .number({ invalid_type_error: `${field} phải là số nguyên.` })
      .int(`${field} phải là số nguyên.`)
      .min(1, `${field} phải lớn hơn hoặc bằng 1.`)
      .max(maximum ?? Number.MAX_SAFE_INTEGER, `${field} không được lớn hơn ${maximum}.`),
  );

const pagingSchema = z
  .object({
    page: queryInteger("page").optional(),
    page_size: queryInteger("page_size", MAX_PAGE_SIZE).optional(),
  })
  // Filtering routes pass their whole query object here; their own strict
  // schema validates the remaining named parameters.
  .passthrough();

const pagingOnlySchema = z
  .object({
    page: z.unknown().optional(),
    page_size: z.unknown().optional(),
  })
  .strict();

export function parsePaging(query: { page?: unknown; page_size?: unknown }): PageParams {
  const parsed = pagingSchema.parse(query);
  return {
    page: parsed.page ?? 1,
    page_size: parsed.page_size ?? DEFAULT_PAGE_SIZE,
  };
}

/** Validate endpoints whose only supported query parameters are page/page_size. */
export function parsePagingOnly(query: Record<string, unknown>): PageParams {
  pagingOnlySchema.parse(query);
  return parsePaging(query);
}

export function pageMeta(paging: PageParams, total: number): PageMeta {
  return {
    page: paging.page,
    page_size: paging.page_size,
    total,
    total_pages: Math.max(1, Math.ceil(total / paging.page_size)),
  };
}

export function offsetOf(paging: PageParams): number {
  return (paging.page - 1) * paging.page_size;
}

/** Single-element `empty` list used when a caller only needs `total`. */
export function emptyMeta(paging: PageParams, total: number): PageMeta {
  return pageMeta(paging, total);
}
