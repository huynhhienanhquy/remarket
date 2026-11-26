import { z } from "zod";
import {
  ACCOUNT_STATS_LABELS,
  ACCOUNT_STATS_TOPICS,
  CONDITIONS,
  DELIVERY_METHODS,
  SORT_OPTIONS,
} from "@remarket/shared";
import type { AiToolResult } from "@remarket/shared";

const price = z.string().regex(/^\d{1,12}$/);
const toolResult = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("search"),
    total: z.number().int().nonnegative(),
    product_ids: z.array(z.string().uuid()).max(6),
    filters: z.object({
      q: z.string().max(100),
      category_id: z.string().uuid(),
      province_code: z.string().max(10),
      condition: z.enum(CONDITIONS),
      delivery_method: z.enum(DELIVERY_METHODS),
      sort: z.enum(SORT_OPTIONS),
      min_price: price,
      max_price: price,
    }).partial(),
    labels: z.array(z.string()).max(8),
  }),
  z.object({
    kind: z.literal("faq"),
    sources: z.array(z.object({
      id: z.string().regex(/^RM-F\d+$/),
      title: z.string(),
      version: z.string(),
      href: z.enum(["/support/new", "/products", "/account/products", "/orders", "/verify-email"]),
    })).max(3),
  }),
  z.object({ kind: z.literal("clarify"), message: z.string().max(500) }),
  z.object({
    kind: z.literal("account_stats"),
    period_label: z.string().max(100),
    as_of: z.string().datetime(),
    topics: z.array(z.enum(ACCOUNT_STATS_TOPICS)).min(1).max(ACCOUNT_STATS_TOPICS.length),
    rows: z.array(z.object({
      key: z.custom<keyof typeof ACCOUNT_STATS_LABELS>(
        (value) => typeof value === "string" && Object.hasOwn(ACCOUNT_STATS_LABELS, value),
      ),
      value: z.union([z.number().finite().nonnegative(), z.string().regex(/^\d+$/), z.null()]),
    })).max(Object.keys(ACCOUNT_STATS_LABELS).length),
  }),
]);

export function parseAssistantResult(content: string): AiToolResult | null {
  try {
    const result = toolResult.safeParse(JSON.parse(content));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
