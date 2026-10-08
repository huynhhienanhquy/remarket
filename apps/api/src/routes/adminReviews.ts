import type { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../utils/prisma.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import type { AuthRequest } from "../middleware/auth.js";
import { ok, okList } from "../shared/api-response.js";
import { notFound } from "../shared/errors.js";
import { offsetOf, pageMeta, parsePaging } from "../shared/pagination.js";
import { toAdminReviewItem } from "../shared/dto-mappers.js";
import { administeredEntityIds, adminActor, adminDateRange, writeAudit } from "../shared/admin-helpers.js";

/**
 * Review moderation (detail-project 14.1): hiding is idempotent, keeps the
 * original hide time and removes the review from rating aggregates.
 */

const router = Router();

const listQuery = z
  .object({
    rating: z.coerce.number().int().min(1).max(5).optional(),
    q: z.string().trim().max(200).optional(),
    visibility: z.enum(["VISIBLE", "HIDDEN", "ALL"]).optional(),
    handled_by: z.string().trim().min(1).max(64).optional(),
    from: z.string().optional(),
    to: z.string().optional(),
    page: z.string().optional(),
    page_size: z.string().optional(),
  })
  .strict();

const reviewInclude = {
  reviewer: true,
  order: { select: { code: true } },
  reviewedUser: { select: { fullName: true } },
} satisfies Prisma.ReviewInclude;

type ReviewWithRelations = Prisma.ReviewGetPayload<{ include: typeof reviewInclude }>;

function toItem(review: ReviewWithRelations) {
  return toAdminReviewItem(
    review,
    review.reviewer,
    review.reviewedUser.fullName,
    review.order.code,
  );
}

// GET /api/v1/admin/reviews?rating&q&page&page_size
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const query = listQuery.parse(req.query);
    const paging = parsePaging(req.query);

    const where: Prisma.ReviewWhereInput = {};
    const handledIds = await administeredEntityIds("review", query.handled_by);
    if (handledIds) where.id = { in: handledIds };
    if (query.rating !== undefined) where.rating = query.rating;
    if (query.q !== undefined) where.comment = { contains: query.q, mode: "insensitive" };
    if (query.visibility === "VISIBLE") where.hiddenAt = null;
    if (query.visibility === "HIDDEN") where.hiddenAt = { not: null };
    where.createdAt = adminDateRange(query.from, query.to);

    const [reviews, total] = await Promise.all([
      prisma.review.findMany({
        where,
        include: reviewInclude,
        orderBy: { createdAt: "desc" },
        skip: offsetOf(paging),
        take: paging.page_size,
      }),
      prisma.review.count({ where }),
    ]);

    okList(res, reviews.map((review) => toItem(review)), pageMeta(paging, total));
  }),
);

const hideBody = z.object({ reason: z.string().trim().min(1).max(500) }).strict();

// POST /api/v1/admin/reviews/:id/hide
router.post(
  "/:id/hide",
  asyncHandler(async (req: AuthRequest, res) => {
    const actor = adminActor(req);
    const body = hideBody.parse(req.body);

    const id = req.params.id;
    const existing = id === undefined ? null : await prisma.review.findUnique({ where: { id } });
    if (existing === null) throw notFound("Không tìm thấy đánh giá này.");

    // Idempotent: hiding again only refreshes the reason and the admin.
    const hiddenAt = existing.hiddenAt ?? new Date();
    const updated = await prisma.$transaction(async (tx) => {
      const review = await tx.review.update({
        where: { id: existing.id },
        data: { hiddenAt, hiddenReason: body.reason, hiddenBy: actor.id },
      });
      await writeAudit(tx, {
        actorId: actor.id,
        actorName: actor.fullName,
        action: "review.hide",
        entityType: "review",
        entityId: review.id,
        reason: body.reason,
        metadata: {},
      });
      return review;
    });

    const saved = await prisma.review.findUnique({
      where: { id: updated.id },
      include: reviewInclude,
    });
    if (saved === null) throw notFound("Không tìm thấy đánh giá này.");
    ok(res, toItem(saved));
  }),
);

export { router as adminReviewsRouter };
