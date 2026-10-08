import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import type { Report } from "@prisma/client";
import { API_ERROR_CODES, REPORT_REASONS, validateReportDescription } from "@remarket/shared";
import type { ReportReason } from "@remarket/shared";
import { prisma } from "../utils/prisma.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import type { AppError } from "../middleware/errorHandler.js";
import { requireActive } from "../middleware/auth.js";
import type { AuthRequest, AuthUser } from "../middleware/auth.js";
import { accountLocked, conflict, notFound, unauthorized, validationError } from "../shared/errors.js";
import { ok, okList } from "../shared/api-response.js";
import { offsetOf, pageMeta, parsePagingOnly } from "../shared/pagination.js";
import { toReportRecord } from "../shared/dto-mappers.js";
import { reportRateLimit } from "../middleware/rate-limit.js";

/**
 * Reports (detail-project 14.2).
 *
 * A user reports a product or another user; admins handle the queue from
 * `/admin/reports`. Creating a report never fans notifications out to every
 * admin — it writes one `AuditLog` row instead, inside the same transaction.
 */

const router = Router();

/** Reporting is a marketplace mutation: LOCKED accounts cannot send one. */
router.use(requireActive);

function currentUser(req: AuthRequest): AuthUser {
  if (!req.user) throw unauthorized();
  return req.user;
}

/** One PENDING report per (reporter, target); surfaced as 409 for the dialog. */
function duplicateReportError(): AppError {
  return conflict(
    API_ERROR_CODES.VALIDATION_ERROR,
    "Bạn đã gửi báo cáo này và đang chờ xử lý.",
    409,
  );
}

const reportRequestSchema = z
  .object({
    target_type: z.enum(["product", "user"], { message: "Hãy chọn loại đối tượng báo cáo." }),
    product_id: z.string().trim().min(1, "Không được để trống.").optional(),
    user_id: z.string().trim().min(1, "Không được để trống.").optional(),
    reason: z.enum(REPORT_REASONS, { message: "Hãy chọn lý do báo cáo." }),
    description: z.string({ message: "Mô tả không hợp lệ." }).optional(),
  })
  .strict();

interface NewReport {
  targetType: "product" | "user";
  targetId: string;
  targetLabel: string;
  reason: ReportReason;
  description: string | null;
}

/** Report + audit row commit together; a unique race maps back to 409. */
async function createWithAudit(user: AuthUser, input: NewReport): Promise<Report> {
  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${user.id} FOR SHARE`;
      const reporter = await tx.user.findUnique({
        where: { id: user.id },
        select: { status: true },
      });
      if (!reporter || reporter.status !== "ACTIVE") throw accountLocked();
      const report = await tx.report.create({
        data: {
          targetType: input.targetType,
          targetId: input.targetId,
          targetLabel: input.targetLabel,
          targetProductId: input.targetType === "product" ? input.targetId : null,
          targetUserId: input.targetType === "user" ? input.targetId : null,
          reporterId: user.id,
          reason: input.reason,
          description: input.description,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          actorName: user.fullName,
          actorType: "USER",
          action: "report.created",
          entityType: "REPORT",
          entityId: report.id,
          metadata: {
            target_type: input.targetType,
            target_id: input.targetId,
            reason: input.reason,
          },
        },
      });
      return report;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw duplicateReportError();
    }
    throw error;
  }
}

// POST /api/v1/reports
router.post(
  "/",
  reportRateLimit,
  asyncHandler(async (req: AuthRequest, res) => {
    const user = currentUser(req);
    const input = reportRequestSchema.parse(req.body);

    const description = input.description?.trim() ?? "";
    const descriptionError = validateReportDescription(description, input.reason);
    if (descriptionError) {
      throw validationError("Nội dung báo cáo chưa hợp lệ.", { description: descriptionError });
    }

    const targetId = input.target_type === "product" ? input.product_id : input.user_id;
    const otherId = input.target_type === "product" ? input.user_id : input.product_id;

    if (!targetId) {
      throw validationError(
        input.target_type === "product"
          ? "Thiếu sản phẩm cần báo cáo."
          : "Thiếu người dùng cần báo cáo.",
        {
          [input.target_type === "product" ? "product_id" : "user_id"]:
            "Vui lòng chọn đối tượng báo cáo.",
        },
      );
    }
    if (otherId) {
      throw validationError("Mỗi báo cáo chỉ được gửi cho một đối tượng.", {
        [input.target_type === "product" ? "user_id" : "product_id"]:
          "Không được gửi kèm đối tượng khác.",
      });
    }

    let targetLabel: string;
    if (input.target_type === "product") {
      const product = await prisma.product.findUnique({
        where: { id: targetId },
        select: { title: true, sellerId: true },
      });
      if (!product) throw notFound("Không tìm thấy món đồ này.");
      if (product.sellerId === user.id) {
        throw validationError("Không thể báo cáo món đồ của chính mình.");
      }
      targetLabel = product.title;
    } else {
      const target = await prisma.user.findUnique({
        where: { id: targetId },
        select: { fullName: true },
      });
      if (!target) throw notFound("Không tìm thấy người dùng này.");
      if (targetId === user.id) throw validationError("Không thể báo cáo chính mình.");
      targetLabel = target.fullName;
    }

    const duplicate = await prisma.report.findFirst({
      where: {
        reporterId: user.id,
        targetType: input.target_type,
        targetId,
        status: "PENDING",
      },
      select: { id: true },
    });
    if (duplicate) throw duplicateReportError();

    const report = await createWithAudit(user, {
      targetType: input.target_type,
      targetId,
      targetLabel,
      reason: input.reason,
      description: description === "" ? null : description,
    });

    ok(res, toReportRecord(report), 201);
  }),
);

// GET /api/v1/reports/mine
router.get(
  "/mine",
  asyncHandler(async (req: AuthRequest, res) => {
    const user = currentUser(req);
    const paging = parsePagingOnly(req.query);
    const where = { reporterId: user.id };

    const [reports, total] = await Promise.all([
      prisma.report.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: offsetOf(paging),
        take: paging.page_size,
      }),
      prisma.report.count({ where }),
    ]);

    okList(res, reports.map(toReportRecord), pageMeta(paging, total));
  }),
);

export { router as reportsRouter };
