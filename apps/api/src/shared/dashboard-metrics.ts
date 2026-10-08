import type { AdminDashboard } from "@remarket/shared";
import { prisma } from "../utils/prisma.js";

interface MetricsRow {
  total_users: bigint;
  new_users_in_period: bigint;
  pending: bigint;
  active: bigint;
  rejected: bigint;
  reserved: bigint;
  sold: bigint;
  inactive: bigint;
  blocked_products: bigint;
  completed_orders_in_period: bigint;
  completed_order_value_in_period: string;
  pending_reports: bigint;
  unresolved_tickets: bigint;
}
type DashboardMetrics = Omit<AdminDashboard, "pending_products_queue" | "open_tickets_queue">;

/** One read-only snapshot for dashboard counters, without permission caching. */
export async function loadDashboardMetrics(from: Date, to: Date): Promise<DashboardMetrics> {
  const [row] = await prisma.$queryRaw<MetricsRow[]>`
    WITH users AS (
      SELECT COUNT(*) AS total_users,
        COUNT(*) FILTER (WHERE "joinedAt" >= ${from} AND "joinedAt" <= ${to}) AS new_users_in_period
      FROM "User"
    ), products AS (
      SELECT COUNT(*) FILTER (WHERE "status" = 'PENDING') AS pending,
        COUNT(*) FILTER (WHERE "status" = 'ACTIVE') AS active,
        COUNT(*) FILTER (WHERE "status" = 'REJECTED') AS rejected,
        COUNT(*) FILTER (WHERE "status" = 'RESERVED') AS reserved,
        COUNT(*) FILTER (WHERE "status" = 'SOLD') AS sold,
        COUNT(*) FILTER (WHERE "status" = 'INACTIVE') AS inactive,
        COUNT(*) FILTER (WHERE "isBlocked") AS blocked_products
      FROM "Product" WHERE "deletedAt" IS NULL
    ), orders AS (
      SELECT COUNT(*) AS completed_orders_in_period,
        COALESCE(SUM("totalAmount"), 0)::text AS completed_order_value_in_period
      FROM "Order"
      WHERE "status" = 'COMPLETED' AND "completedAt" >= ${from} AND "completedAt" <= ${to}
    ), reports AS (
      SELECT COUNT(*) AS pending_reports FROM "Report" WHERE "status" = 'PENDING'
    ), tickets AS (
      SELECT COUNT(*) AS unresolved_tickets FROM "SupportTicket" WHERE "status" IN ('OPEN', 'IN_PROGRESS')
    )
    SELECT * FROM users CROSS JOIN products CROSS JOIN orders CROSS JOIN reports CROSS JOIN tickets
  `;
  if (!row) throw new Error("Dashboard metrics query returned no row");
  return {
    total_users: Number(row.total_users),
    new_users_in_period: Number(row.new_users_in_period),
    pending_products: Number(row.pending),
    completed_orders_in_period: Number(row.completed_orders_in_period),
    completed_order_value_in_period: row.completed_order_value_in_period,
    pending_reports: Number(row.pending_reports),
    products_by_status: {
      PENDING: Number(row.pending), ACTIVE: Number(row.active), REJECTED: Number(row.rejected),
      RESERVED: Number(row.reserved), SOLD: Number(row.sold), INACTIVE: Number(row.inactive),
    },
    blocked_products: Number(row.blocked_products),
    unresolved_tickets: Number(row.unresolved_tickets),
  };
}
