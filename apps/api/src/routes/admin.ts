import type { Prisma } from "@prisma/client";
import type { AdminDashboard } from "@remarket/shared";
import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/errorHandler.js";
import { prisma } from "../utils/prisma.js";
import { ok } from "../shared/api-response.js";
import { toAdminProductItem, toAdminSupportTicketItem } from "../shared/dto-mappers.js";
import { adminDateRange } from "../shared/admin-helpers.js";
import { loadDashboardMetrics } from "../shared/dashboard-metrics.js";

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
