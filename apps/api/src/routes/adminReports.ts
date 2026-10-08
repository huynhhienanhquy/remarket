import type { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../utils/prisma.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import type { AuthRequest } from "../middleware/auth.js";
import { ok, okList } from "../shared/api-response.js";
import { invalidTransition, notFound } from "../shared/errors.js";
import { offsetOf, pageMeta, parsePaging } from "../shared/pagination.js";
import { toAdminReportItem } from "../shared/dto-mappers.js";
import { adminActor, adminDateRange, writeAudit } from "../shared/admin-helpers.js";
import { blockProduct, lockUser } from "../services/admin-moderation.js";

/**
 * Report handling (detail-project 14.2 / 15): only `PENDING` reports may be
 * resolved or rejected, the outcome notifies the reporter once (deduped) and
 * every decision lands in the audit log.
 */

const router = Router();

const listQuery = z
  .object({
    status: z.enum(["PENDING", "RESOLVED", "REJECTED", "ALL"]).optional(),
    reason: z
      .enum([
        "COUNTERFEIT",
        "PROHIBITED",
        "FRAUD",
        "SPAM",
        "HARASSMENT",
        "INAPPROPRIATE",
        "OTHER",
        "ALL",
      ])
      .optional(),
    target_type: z.enum(["product", "user", "ALL"]).optional(),
    handled_by: z.string().trim().min(1).max(64).optional(),
    from: z.string().optional(),
    to: z.string().optional(),
    page: z.string().optional(),
    page_size: z.string().optional(),
  })
  .strict();

// GET /api/v1/admin/reports?status&reason&page&page_size
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const query = listQuery.parse(req.query);
    const paging = parsePaging(req.query);

    const where: Prisma.ReportWhereInput = {};
    if (query.status !== undefined && query.status !== "ALL") where.status = query.status;
    if (query.reason !== undefined && query.reason !== "ALL") where.reason = query.reason;
    if (query.target_type !== undefined && query.target_type !== "ALL") where.targetType = query.target_type;
    if (query.handled_by !== undefined) where.handledById = query.handled_by;
    where.createdAt = adminDateRange(query.from, query.to);

    const [reports, total] = await Promise.all([
      prisma.report.findMany({
        where,
        include: {
          reporter: { select: { fullName: true } },
          handledBy: { select: { fullName: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: offsetOf(paging),
        take: paging.page_size,
      }),
      prisma.report.count({ where }),
    ]);

    okList(
      res,
      reports.map((report) =>
        toAdminReportItem(
          report,
          report.reporter.fullName,
          report.handledBy?.fullName ?? null,
          report.handledAt,
        ),
      ),
      pageMeta(paging, total),
    );
  }),
);

const decisionBody = z
  .object({
    resolution_note: z.string().trim().min(1).max(1000),
    action: z.enum(["block_product", "lock_user", "none"]).optional(),
  })
  .strict();

const rejectionBody = z
  .object({ resolution_note: z.string().trim().min(1).max(1000) })
  .strict();

/** Loads a report for handling; anything but `PENDING` is a 409. */
async function lockPendingReport(tx: Prisma.TransactionClient, id: string | undefined) {
  if (id === undefined) throw notFound("Không tìm thấy báo cáo này.");
  await tx.$queryRaw`SELECT "id" FROM "Report" WHERE "id" = ${id} FOR UPDATE`;
  const report = await tx.report.findUnique({ where: { id } });
  if (report === null) throw notFound("Không tìm thấy báo cáo này.");
  if (report.status !== "PENDING") {
    throw invalidTransition("Báo cáo này đã được xử lý trước đó.");
  }
  return report;
}

async function loadHandledReport(id: string) {
  const report = await prisma.report.findUnique({
    where: { id },
    include: {
      reporter: { select: { fullName: true } },
      handledBy: { select: { fullName: true } },
    },
  });
  if (report === null) throw notFound("Không tìm thấy báo cáo này.");
  return report;
}

/** Optional follow-up action chosen together with a resolution. */
async function applyResolutionAction(
  tx: Prisma.TransactionClient,
  report: { id: string; targetType: string; targetProductId: string | null; targetUserId: string | null },
  action: "block_product" | "lock_user" | "none" | undefined,
  note: string,
  actor: { id: string; fullName: string },
): Promise<void> {
  if (action === undefined || action === "none") return;

  if (action === "block_product") {
    if (report.targetType !== "product" || report.targetProductId === null) {
      throw notFound("Báo cáo này không gắn với tin đăng.");
    }
    await blockProduct(tx, {
      productId: report.targetProductId,
      reason: note,
      actor,
      auditMetadata: { report_id: report.id },
    });
    return;
  }

  if (report.targetType !== "user" || report.targetUserId === null) {
    throw notFound("Báo cáo này không gắn với người dùng.");
  }
  await lockUser(tx, {
    userId: report.targetUserId,
    reason: note,
    actor,
    auditMetadata: { report_id: report.id },
  });
}

function reporterNotification(
  reportId: string,
  reporterId: string,
  title: string,
  content: string,
): Prisma.NotificationCreateManyInput {
  return {
    userId: reporterId,
    type: "REPORT_RESULT",
    title,
    content,
    referenceType: "report",
    referenceId: reportId,
    dedupeKey: `report-result:${reportId}`,
  };
}

// POST /api/v1/admin/reports/:id/resolve
router.post(
  "/:id/resolve",
  asyncHandler(async (req: AuthRequest, res) => {
    const actor = adminActor(req);
    const body = decisionBody.parse(req.body);
    const reportId = await prisma.$transaction(async (tx) => {
      const report = await lockPendingReport(tx, req.params.id);
      await applyResolutionAction(tx, report, body.action, body.resolution_note, actor);
      const now = new Date();
      await tx.report.update({
        where: { id: report.id },
        data: {
          status: "RESOLVED",
          resolutionNote: body.resolution_note,
          handledById: actor.id,
          handledAt: now,
        },
      });
      await tx.notification.createMany({
        data: [
          reporterNotification(
            report.id,
            report.reporterId,
            "Báo cáo đã được xử lý",
            `Báo cáo của bạn đã được xử lý: ${body.resolution_note}`,
          ),
        ],
        skipDuplicates: true,
      });
      await writeAudit(tx, {
        actorId: actor.id,
        actorName: actor.fullName,
        action: "report.resolve",
        entityType: "report",
        entityId: report.id,
        reason: body.resolution_note,
        metadata: { action: body.action ?? "none" },
      });
      return report.id;
    });

    const saved = await loadHandledReport(reportId);
    ok(
      res,
      toAdminReportItem(
        saved,
        saved.reporter.fullName,
        saved.handledBy?.fullName ?? null,
        saved.handledAt,
      ),
    );
  }),
);

// POST /api/v1/admin/reports/:id/reject
router.post(
  "/:id/reject",
  asyncHandler(async (req: AuthRequest, res) => {
    const actor = adminActor(req);
    const body = rejectionBody.parse(req.body);
    const reportId = await prisma.$transaction(async (tx) => {
      const report = await lockPendingReport(tx, req.params.id);
      await tx.report.update({
        where: { id: report.id },
        data: {
          status: "REJECTED",
          resolutionNote: body.resolution_note,
          handledById: actor.id,
          handledAt: new Date(),
        },
      });
      await tx.notification.createMany({
        data: [
          reporterNotification(
            report.id,
            report.reporterId,
            "Báo cáo bị từ chối",
            `Báo cáo của bạn bị từ chối: ${body.resolution_note}`,
          ),
        ],
        skipDuplicates: true,
      });
      await writeAudit(tx, {
        actorId: actor.id,
        actorName: actor.fullName,
        action: "report.reject",
        entityType: "report",
        entityId: report.id,
        reason: body.resolution_note,
        metadata: {},
      });
      return report.id;
    });

    const saved = await loadHandledReport(reportId);
    ok(
      res,
      toAdminReportItem(
        saved,
        saved.reporter.fullName,
        saved.handledBy?.fullName ?? null,
        saved.handledAt,
      ),
    );
  }),
);

export { router as adminReportsRouter };
