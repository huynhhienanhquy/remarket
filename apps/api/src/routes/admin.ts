import type { AdminDashboard } from "@remarket/shared";
import { Router } from "express";
import type { AdminNavigationCounts } from "@remarket/shared";
import { z } from "zod";
import { asyncHandler } from "../middleware/errorHandler.js";
import { prisma } from "../utils/prisma.js";
import { ok } from "../shared/api-response.js";
import { toAdminProductItem, toAdminSupportTicketItem } from "../shared/dto-mappers.js";
import { adminDateRange } from "../shared/admin-helpers.js";
import { loadDashboardMetrics } from "../shared/dashboard-metrics.js";
import { adminSummaryLoaders } from "../shared/admin-workspace-summary.js";

import { adminUsersRouter } from "./adminUsers.js";
import { adminProductsRouter } from "./adminProducts.js";
import { adminCategoriesRouter } from "./adminCategories.js";
import { adminReportsRouter } from "./adminReports.js";
import { adminReviewsRouter } from "./adminReviews.js";
import { adminSupportRouter } from "./adminSupport.js";
import { adminAuditRouter } from "./adminAudit.js";
import { adminOrdersRouter } from "./adminOrders.js";
import { adminEmailVerificationsRouter } from "./adminEmailVerifications.js";

/**
 * Admin module (detail-project 15). `app.ts` mounts this router behind
 * `authMiddleware` + `requireRole("ADMIN")`, so this file only wires the
 * sub-routers, serves the dashboard and owns the shared audit helper every
 * admin mutation writes through.
 */

const router = Router();

router.get("/summary/:section", asyncHandler(async (req, res) => {
  const section = z.enum(["users", "reports", "reviews", "support", "email", "audit"]).parse(req.params.section);
  const today = new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const start = new Date(today + "T00:00:00.000+07:00");
  const end = new Date(start.getTime() + 86400000 - 1);
  ok(res, await adminSummaryLoaders[section](start, end));
}));

// Load the four badge counts in one statement without fetching queue rows.
router.get("/navigation-counts", asyncHandler(async (_req, res) => {
  const [row] = await prisma.$queryRaw<Array<{ [K in keyof AdminNavigationCounts]: bigint }>>`
    SELECT
      (SELECT COUNT(*) FROM "User" WHERE "emailVerificationRequestedAt" IS NOT NULL AND "emailVerifiedAt" IS NULL)
        AS pending_email_verifications,
      (SELECT COUNT(*) FROM "Report" WHERE status = 'PENDING') AS pending_reports,
      (SELECT COUNT(*) FROM "SupportTicket" WHERE status = 'OPEN') AS open_tickets,
      (SELECT COUNT(*) FROM "Product" WHERE status = 'PENDING' AND "deletedAt" IS NULL) AS pending_products
  `;
  if (!row) throw new Error("Admin navigation counts query returned no row");
  const counts: AdminNavigationCounts = {
    pending_email_verifications: Number(row.pending_email_verifications),
    pending_reports: Number(row.pending_reports),
    open_tickets: Number(row.open_tickets),
    pending_products: Number(row.pending_products),
  };
  ok(res, counts);
}));

const dashboardQuerySchema = z
  .object({
    from: z.string().optional(),
    to: z.string().optional(),
  })
  .strict();

// GET /api/v1/admin/dashboard?from&to

router.get(
  "/dashboard",
  asyncHandler(async (req, res) => {
    const query = dashboardQuerySchema.parse(req.query);
    const today = new Date(Date.now() + 7 * 60 * 60 * 1000);
    const start = new Date(today);
    start.setUTCDate(start.getUTCDate() - 29);
    const period = adminDateRange(
      query.from ?? start.toISOString().slice(0, 10),
      query.to ?? today.toISOString().slice(0, 10),
    );
    // Both validated/default dates are present; keep Vietnam's inclusive bounds.
    if (!(period?.gte instanceof Date) || !(period.lte instanceof Date)) throw new Error("Missing dashboard period bounds");
    const [metrics, pendingProductsQueue, openTicketsQueue] = await Promise.all([
      loadDashboardMetrics(period.gte, period.lte),
      prisma.product.findMany({
        where: { status: "PENDING", deletedAt: null },
        include: { images: { orderBy: { sortOrder: "asc" } }, seller: true, category: true },
        orderBy: { createdAt: "asc" },
        take: 5,
      }),
      prisma.supportTicket.findMany({
        where: { status: "OPEN" },
        include: { user: true, assignedAdmin: true },
        orderBy: { updatedAt: "asc" },
        take: 5,
      }),
    ]);

    // "Giá trị giao dịch", không phải doanh thu (detail-project 15).
    const dashboard: AdminDashboard = {
      ...metrics,
      pending_products_queue: pendingProductsQueue.map((product) =>
        toAdminProductItem(product, product.category.name),
      ),
      open_tickets_queue: openTicketsQueue.map((ticket) =>
        toAdminSupportTicketItem(ticket, ticket.user, ticket.assignedAdmin),
      ),
    };

    ok(res, dashboard);
  }),
);

router.use("/users", adminUsersRouter);
router.use("/email-verifications", adminEmailVerificationsRouter);
router.use("/products", adminProductsRouter);
router.use("/categories", adminCategoriesRouter);
router.use("/reports", adminReportsRouter);
router.use("/reviews", adminReviewsRouter);
router.use("/support-tickets", adminSupportRouter);
router.use("/audit-logs", adminAuditRouter);
router.use("/orders", adminOrdersRouter);

export { router as adminRouter };
