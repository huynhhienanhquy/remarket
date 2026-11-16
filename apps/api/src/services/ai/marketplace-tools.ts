import { AsyncLocalStorage } from "node:async_hooks";
import { z } from "zod";
import {
  CONDITIONS, CONDITION_LABELS, DELIVERY_METHODS, DELIVERY_LABELS, SORT_OPTIONS,
  PROVINCES, provinceLabel, formatVnd, normalizePriceFilter,
} from "@remarket/shared";
import type { AiFaqSource, AiSearchFilters, AiToolResult } from "@remarket/shared";
import { prisma } from "../../utils/prisma.js";
import { searchPublicProducts } from "../../shared/product-search.js";
import { eligibleCategoryIds } from "../category-policy.js";
import faq from "./public-faq.json" with { type: "json" };

export interface MarketplaceRunContext {
  viewer: Parameters<typeof searchPublicProducts>[1];
  filters: AiSearchFilters;
  results: AiToolResult[];
  signal: AbortSignal;
  inputTokens?: number;
  outputTokens?: number;
}

export const marketplaceContext = new AsyncLocalStorage<MarketplaceRunContext>();

const price = z.string().trim().regex(/^\d{1,12}$/);
export const filtersSchema = z.object({
  q: z.string().max(100),
  category_id: z.string().uuid(),
  province_code: z.string().max(10),
  condition: z.enum(CONDITIONS),
  delivery_method: z.enum(DELIVERY_METHODS),
  min_price: price,
  max_price: price,
  sort: z.enum(SORT_OPTIONS),
}).partial().strict();

export const searchPatch = z.object({
  q: z.string().trim().max(100).nullable(),
  category: z.string().trim().max(100).nullable(),
  province: z.string().trim().max(100).nullable(),
  condition: z.enum(CONDITIONS).nullable(),
  delivery_method: z.enum(DELIVERY_METHODS).nullable(),
  min_price: price.nullable().describe("Giá tối thiểu bao gồm, số nguyên VND dạng chuỗi."),
  max_price: price.nullable().describe("Giá tối đa bao gồm, số nguyên VND dạng chuỗi."),
  min_exclusive: z.boolean().describe("Chỉ true khi yêu cầu giá cao hơn min_price."),
  max_exclusive: z.boolean().describe("Chỉ true khi yêu cầu giá thấp hơn max_price."),
  sort: z.enum(SORT_OPTIONS).nullable(),
}).partial().strict();

export const faqQuery = z.object({ query: z.string().trim().min(1).max(200) }).strict();

function fold(value: string) {
  return value.toLowerCase().replace(/đ/g, "d").normalize("NFD").replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, " ").trim();
}

export function redactChatText(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, "[email]")
    .replace(/(?<![\p{L}\d])(?:\+?84|0)(?:[ .()-]*\d){9,10}(?!\d)/gu, "[số điện thoại]")
    .replace(/(?:địa chỉ|giao (?:hàng )?đến|nhà ở)\s*[:=]?\s*(?:số\s+)?\d[^\n,;]*/giu, "[địa chỉ]")
    .replace(/\b\d{1,5}(?:\/\d{1,5})*\s+(?:đường|phố|hẻm|ngõ|ngách|quốc lộ)\s+[^\n,;]+/giu, "[địa chỉ]");
}

export function requireMarketplaceContext() {
  const current = marketplaceContext.getStore();
  if (!current) throw new Error("Missing marketplace session context");
  current.signal.throwIfAborted();
  return current;
}

function pickFilters(previous: AiSearchFilters, changes: Record<string, unknown>) {
  const next = { ...previous, ...changes };
  return filtersSchema.parse(Object.fromEntries(Object.entries(next).filter(([, value]) => value != null && value !== "")));
}

export function inclusivePriceRange(input: z.infer<typeof searchPatch>) {
  return {
    min_price: input.min_exclusive && input.min_price != null
      ? String(BigInt(input.min_price) + 1n)
      : input.min_price,
    max_price: input.max_exclusive && input.max_price != null
      ? String(BigInt(input.max_price) - 1n)
      : input.max_price,
  };
}

export async function runSearch(input: z.infer<typeof searchPatch>) {
  const current = requireMarketplaceContext();
  const clarify = (message: string) => {
    const result = { kind: "clarify", message } as const;
    current.results.push(result);
    return result;
  };
  const { category, province, min_exclusive: _min, max_exclusive: _max, ...patch } = input;
  const limits = inclusivePriceRange(input);
  const changes: Record<string, unknown> = { ...patch };
  for (const [key, value] of Object.entries(limits)) {
    if (value === undefined) continue;
    if (value !== null && !price.safeParse(value).success) return clarify("Bạn muốn tìm trong khoảng giá nào?");
    changes[key] = value;
  }
  if (province !== undefined) {
    const term = fold(province ?? "").replace(/^(?:tinh|thanh pho|tp) /, "");
    const matches = PROVINCES.filter(({ code, name }) =>
      fold(code) === term || fold(name) === term ||
      (name === "Hồ Chí Minh" && ["hcm", "tphcm", "sai gon"].includes(term)) ||
      (name === "Hà Nội" && term === "hn"));
    if (province !== null && matches.length !== 1) return clarify("Bạn muốn tìm ở tỉnh hoặc thành phố nào?");
    changes.province_code = matches[0]?.code ?? null;
  }
  const categoryRows = category || current.filters.category_id
    ? await prisma.category.findMany({ select: { id: true, name: true, slug: true, status: true, parentId: true } })
    : [];
  if (category !== undefined) {
    const term = fold(category ?? "");
    const eligible = eligibleCategoryIds(categoryRows.map((row) => ({ ...row, isLeaf: true })));
    const matches = categoryRows.filter((row) => eligible.has(row.id) &&
      (row.id === category || fold(row.name) === term || fold(row.slug) === term));
    if (category !== null && matches.length !== 1) return clarify("Bạn muốn tìm trong danh mục nào?");
    changes.category_id = matches[0]?.id ?? null;
  }
  const filters = pickFilters(current.filters, changes);
  const prices = normalizePriceFilter(filters.min_price ?? "", filters.max_price ?? "");
  if (prices.error) return clarify(prices.error);
  current.signal.throwIfAborted();
  const { items, total } = await searchPublicProducts({
    keyword: filters.q ?? "", categoryId: filters.category_id, condition: filters.condition,
    provinceCode: filters.province_code, deliveryMethod: filters.delivery_method,
    minPrice: prices.min, maxPrice: prices.max, sort: filters.sort ?? "newest", offset: 0, limit: 6,
  }, current.viewer);
  current.signal.throwIfAborted();
  current.filters = filters;
  const labels = [
    filters.q,
    categoryRows.find((row) => row.id === filters.category_id)?.name,
    provinceLabel(filters.province_code),
    filters.condition && CONDITION_LABELS[filters.condition],
    filters.delivery_method && DELIVERY_LABELS[filters.delivery_method],
    prices.min && `Từ ${formatVnd(prices.min)}`,
    prices.max && `Đến ${formatVnd(prices.max)}`,
  ].filter((label): label is string => Boolean(label));
  const result = { kind: "search", total, product_ids: items.map(({ id }) => id), filters, labels } as const;
  current.results.push(result);
  return result;
}

const sourceLinks = z.enum(["/support/new", "/products", "/account/products", "/orders", "/verify-email"]);

export function findPublicFaq(query: string, now = new Date()) {
  const normalized = ` ${fold(query)} `;
  return faq.filter((entry) => entry.audience === "public" && new Date(entry.effective_from) <= now)
    .map((entry) => ({
      entry,
      score: Math.max(0, ...entry.aliases.map((alias) => {
        const term = fold(alias);
        return normalized.includes(` ${term} `) ? term.length : 0;
      })),
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ entry }): AiFaqSource & { text: string } => ({
      id: entry.id, title: entry.title, version: entry.version, href: sourceLinks.parse(entry.href), text: entry.text,
    }));
}

export function runFaq({ query }: z.infer<typeof faqQuery>) {
  const current = requireMarketplaceContext();
  const entries = findPublicFaq(query);
  const result = { kind: "faq", sources: entries.map(({ id, title, version, href }) => ({ id, title, version, href })) } as const;
  current.results.push(result);
  return { ...result, excerpts: entries.map(({ id, text }) => ({ id, text })) };
}

export function isCurrentFaqSource(source: AiFaqSource, now = new Date()) {
  return faq.some((entry) => entry.audience === "public" && entry.id === source.id && entry.version === source.version &&
    entry.href === source.href && entry.title === source.title && new Date(entry.effective_from) <= now);
}
