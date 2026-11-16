import { Prisma } from "@prisma/client";
import { ACCOUNT_STATS_TOPICS, formatDate } from "@remarket/shared";
import type { AiAccountStats, AiToolResult } from "@remarket/shared";
import { z } from "zod";
import { prisma } from "../../utils/prisma.js";
import { requireMarketplaceContext } from "./marketplace-tools.js";

const dayMs = 86_400_000;
// ReMarket uses Asia/Ho_Chi_Minh for business dates.
const vietnamOffsetMs = 7 * 3_600_000;
const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const accountStatsQuery = z.object({
  topics: z.array(z.enum(ACCOUNT_STATS_TOPICS)).min(1).max(ACCOUNT_STATS_TOPICS.length),
  period: z.enum(["all_time", "today", "yesterday", "this_week", "last_week", "this_month", "last_month",
    "last_7_days", "last_30_days", "this_year", "last_year", "custom"]),
  start_date: calendarDate.nullable().describe("Ngày đầu YYYY-MM-DD, dùng null nếu period khác custom."),
  end_date: calendarDate.nullable().describe("Ngày cuối bao gồm YYYY-MM-DD, dùng null nếu period khác custom."),
}).strict();

type Query = z.infer<typeof accountStatsQuery>;
type Row = AiAccountStats["rows"][number];
type DateRange = { gte: Date; lt: Date };

function parseLocalDate(value: string | null) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return null;
  return date.getTime();
}

export function accountStatsRange({ period, start_date, end_date }: Query, now: Date) {
  if (period === "all_time") return { label: "Toàn bộ thời gian", range: undefined };
  const local = new Date(now.getTime() + vietnamOffsetMs);
  const year = local.getUTCFullYear();
  const month = local.getUTCMonth();
  const today = Date.UTC(year, month, local.getUTCDate());
  const monday = today - ((local.getUTCDay() + 6) % 7) * dayMs;
  let start: number;
  let end = today + dayMs;
  switch (period) {
    case "today": start = today; break;
    case "yesterday": start = today - dayMs; end = today; break;
    case "this_week": start = monday; break;
    case "last_week": start = monday - 7 * dayMs; end = monday; break;
    case "this_month": start = Date.UTC(year, month, 1); break;
    case "last_month": start = Date.UTC(year, month - 1, 1); end = Date.UTC(year, month, 1); break;
    case "last_7_days": start = today - 6 * dayMs; break;
    case "last_30_days": start = today - 29 * dayMs; break;
    case "this_year": start = Date.UTC(year, 0, 1); break;
    case "last_year": start = Date.UTC(year - 1, 0, 1); end = Date.UTC(year, 0, 1); break;
    case "custom": {
      const from = parseLocalDate(start_date);
      const to = parseLocalDate(end_date);
      if (from === null || to === null || from > to || from > today) return null;
      start = from;
      end = Math.min(to + dayMs, end);
      break;
    }
  }
  const gte = new Date(start - vietnamOffsetMs);
  const lastDay = new Date(end - vietnamOffsetMs - 1);
  const first = formatDate(gte.toISOString());
  const last = formatDate(lastDay.toISOString());
  return { label: first === last ? first : `${first} – ${last}`, range: { gte, lt: new Date(Math.min(lastDay.getTime() + 1, now.getTime())) } };
}

function during(column: Prisma.Sql, range?: DateRange) {
  return range ? Prisma.sql`${column} >= ${range.gte} AND ${column} < ${range.lt}` : Prisma.sql`TRUE`;
}

async function loadOrderStats(userId: string, topic: "sales" | "purchases", range?: DateRange): Promise<Row[]> {
  const owner = topic === "sales" ? Prisma.sql`"sellerId"` : Prisma.sql`"buyerId"`;
  const amount = topic === "sales" ? Prisma.sql`subtotal` : Prisma.sql`"totalAmount"`;
  const placed = during(Prisma.sql`"createdAt"`, range);
  const completed = Prisma.sql`status = 'COMPLETED' AND ${during(Prisma.sql`"completedAt"`, range)}`;
  const cancelled = Prisma.sql`status = 'CANCELLED' AND ${during(Prisma.sql`"cancelledAt"`, range)}`;
  const [stat] = await prisma.$queryRaw<Array<{
    placed: bigint; pending: bigint; confirmed: bigint; shipping: bigint; delivered: bigint;
    completed: bigint; cancelled: bigint; items: bigint; amount: string;
  }>>(Prisma.sql`
    WITH owned_orders AS MATERIALIZED (
      SELECT id, status, "createdAt", "completedAt", "cancelledAt", ${amount} AS amount
      FROM "Order" WHERE ${owner} = ${userId}
    )
    SELECT
      COUNT(*) FILTER (WHERE ${placed}) AS placed,
      COUNT(*) FILTER (WHERE status = 'PENDING' AND ${placed}) AS pending,
      COUNT(*) FILTER (WHERE status = 'CONFIRMED' AND ${placed}) AS confirmed,
      COUNT(*) FILTER (WHERE status = 'SHIPPING' AND ${placed}) AS shipping,
      COUNT(*) FILTER (WHERE status = 'DELIVERED' AND ${placed}) AS delivered,
      COUNT(*) FILTER (WHERE ${completed}) AS completed,
      COUNT(*) FILTER (WHERE ${cancelled}) AS cancelled,
      COALESCE(SUM(amount) FILTER (WHERE ${completed}), 0)::text AS amount,
      (SELECT COUNT(*) FROM "OrderItem" item JOIN owned_orders o ON o.id = item."orderId" WHERE ${completed}) AS items
    FROM owned_orders
  `);
  if (!stat) throw new Error("Missing order aggregates");
  return [
    { key: `${topic}_placed`, value: Number(stat.placed) },
    { key: `${topic}_in_progress`, value: Number(stat.pending + stat.confirmed + stat.shipping + stat.delivered) },
    { key: `${topic}_pending`, value: Number(stat.pending) },
    { key: `${topic}_confirmed`, value: Number(stat.confirmed) },
    { key: `${topic}_shipping`, value: Number(stat.shipping) },
    { key: `${topic}_delivered`, value: Number(stat.delivered) },
    { key: `${topic}_completed`, value: Number(stat.completed) },
    { key: `${topic}_cancelled`, value: Number(stat.cancelled) },
    { key: `${topic}_items`, value: Number(stat.items) },
    { key: topic === "sales" ? "sales_revenue" : "purchases_spending", value: stat.amount },
  ];
}

async function loadListingStats(userId: string, createdAt?: DateRange): Promise<Row[]> {
  const groups = await prisma.product.groupBy({
    by: ["status", "isBlocked"], where: { sellerId: userId, deletedAt: null, createdAt }, _count: { _all: true },
  });
  const total = groups.reduce((sum, row) => sum + row._count._all, 0);
  const blocked = groups.filter((row) => row.isBlocked).reduce((sum, row) => sum + row._count._all, 0);
  const statusCounts = new Map(groups.filter((row) => !row.isBlocked).map((row) => [row.status, row._count._all]));
  return [
    { key: "listings_total", value: total },
    { key: "listings_active", value: statusCounts.get("ACTIVE") ?? 0 },
    { key: "listings_pending", value: statusCounts.get("PENDING") ?? 0 },
    { key: "listings_reserved", value: statusCounts.get("RESERVED") ?? 0 },
    { key: "listings_sold", value: statusCounts.get("SOLD") ?? 0 },
    { key: "listings_rejected", value: statusCounts.get("REJECTED") ?? 0 },
    { key: "listings_inactive", value: statusCounts.get("INACTIVE") ?? 0 },
    { key: "listings_blocked", value: blocked },
  ];
}

async function loadTopic(userId: string, topic: Query["topics"][number], createdAt?: DateRange): Promise<Row[]> {
  switch (topic) {
    case "sales":
    case "purchases":
      return loadOrderStats(userId, topic, createdAt);
    case "listings":
      return loadListingStats(userId, createdAt);
    case "favorites":
      return [{ key: "favorites_total", value: await prisma.favorite.count({ where: { userId, createdAt } }) }];
    case "reviews": {
      const rows = await prisma.review.aggregate({
        where: { reviewedUserId: userId, hiddenAt: null, createdAt }, _count: { _all: true }, _avg: { rating: true },
      });
      return [
        { key: "reviews_total", value: rows._count._all },
        { key: "reviews_average", value: rows._avg.rating === null ? null : Math.round(rows._avg.rating * 10) / 10 },
      ];
    }
    case "support": {
      const rows = await prisma.supportTicket.groupBy({ by: ["status"], where: { userId, createdAt }, _count: { _all: true } });
      return [
        { key: "support_total", value: rows.reduce((sum, row) => sum + row._count._all, 0) },
        { key: "support_open", value: rows.filter((row) => row.status === "OPEN" || row.status === "IN_PROGRESS").reduce((sum, row) => sum + row._count._all, 0) },
      ];
    }
  }
}

export async function runAccountStats(input: Query): Promise<AiToolResult> {
  const current = requireMarketplaceContext();
  const { viewerId, viewerStatus } = current.viewer;
  if (!viewerId || viewerStatus !== "ACTIVE") throw new Error("Missing active marketplace account");
  const now = new Date();
  const period = accountStatsRange(input, now);
  if (!period) {
    const result = { kind: "clarify", tool: "get_account_stats", message: "Bạn muốn xem số liệu từ ngày nào đến ngày nào? Hãy chọn một khoảng ngày hợp lệ." } as const;
    current.results.push(result);
    return result;
  }
  const topics = [...new Set(input.topics)];
  const rows = (await Promise.all(topics.map((topic) => loadTopic(viewerId, topic, period.range)))).flat();
  current.signal.throwIfAborted();
  const result = { kind: "account_stats", period_label: period.label, as_of: now.toISOString(), topics, rows } as const;
  current.results.push(result);
  return result;
}
