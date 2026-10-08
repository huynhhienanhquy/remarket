// Read-only parity check against the previous Prisma aggregates on the same DB.
import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import type { ProductStatus } from "@remarket/shared";

config({ path: fileURLToPath(new URL("../.env", import.meta.url)), quiet: true });
const { prisma } = await import("../src/utils/prisma.js");
const { loadDashboardMetrics } = await import("../src/shared/dashboard-metrics.js");
const { adminDateRange } = await import("../src/shared/admin-helpers.js");
const results = [];
try {
  for (const [from, to] of [["2026-10-07", "2026-10-07"], ["2020-01-01", "2030-12-31"], ["2000-01-01", "2000-01-01"]]) {
    const period = adminDateRange(from, to);
    assert(period?.gte instanceof Date && period.lte instanceof Date);
    const oldStart = performance.now();
    const [totalUsers, newUsers, pending, completed, value, reports, statuses, blocked, tickets] = await Promise.all([
      prisma.user.count(), prisma.user.count({ where: { joinedAt: period } }),
      prisma.product.count({ where: { status: "PENDING", deletedAt: null } }),
      prisma.order.count({ where: { status: "COMPLETED", completedAt: period } }),
      prisma.order.aggregate({ where: { status: "COMPLETED", completedAt: period }, _sum: { totalAmount: true } }),
      prisma.report.count({ where: { status: "PENDING" } }),
      prisma.product.groupBy({ by: ["status"], where: { deletedAt: null }, _count: { _all: true } }),
      prisma.product.count({ where: { deletedAt: null, isBlocked: true } }),
      prisma.supportTicket.count({ where: { status: { in: ["OPEN", "IN_PROGRESS"] } } }),
    ]);
    const oldMs = Math.round(performance.now() - oldStart);
    const productsByStatus: Record<ProductStatus, number> = { PENDING: 0, ACTIVE: 0, REJECTED: 0, RESERVED: 0, SOLD: 0, INACTIVE: 0 };
    for (const status of statuses) productsByStatus[status.status] = status._count._all;
    const newStart = performance.now();
    const current = await loadDashboardMetrics(period.gte, period.lte);
    assert.deepEqual(current, {
      total_users: totalUsers, new_users_in_period: newUsers, pending_products: pending,
      completed_orders_in_period: completed, completed_order_value_in_period: value._sum.totalAmount?.toString() ?? "0",
      pending_reports: reports, products_by_status: productsByStatus, blocked_products: blocked, unresolved_tickets: tickets,
    });
    const result = { from, to, old_aggregates_ms: oldMs, new_aggregate_ms: Math.round(performance.now() - newStart), matched: true };
    results.push(result); console.log(JSON.stringify(result));
  }
  const dir = fileURLToPath(new URL("../../../.artifacts/performance/", import.meta.url));
  await mkdir(dir, { recursive: true });
  await writeFile(`${dir}dashboard-parity.json`, JSON.stringify(results, null, 2));
} finally { await prisma.$disconnect(); }
