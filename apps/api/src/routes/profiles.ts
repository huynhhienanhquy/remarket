import { Router } from "express";
import { prisma } from "../utils/prisma.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { optionalAuth } from "../middleware/auth.js";
import type { AuthRequest } from "../middleware/auth.js";
import { ok, okList } from "../shared/api-response.js";
import { offsetOf, pageMeta, parsePagingOnly } from "../shared/pagination.js";
import { notFound } from "../shared/errors.js";
import { toProductListItem, toPublicProfile, toReview } from "../shared/dto-mappers.js";
import { loadSellerAggregate } from "../shared/seller-aggregates.js";
import { viewerFrom } from "../shared/viewer.js";
import { readProducts } from "../shared/product-reads.js";

/**
 * Public profile endpoints mounted at `/api/v1/users` (detail-project 8/14.1).
 *
 * Everything here is readable without a session, so the router applies
 * `optionalAuth` only to enrich the viewer context (favourites, capabilities)
 * and never rejects an anonymous caller. Responses are strictly public:
 * `PublicProfile` exposes the seller summary — never email, phone or address.
 */

const router = Router();
router.use(optionalAuth);

/** Route params may be absent at the type level; a bad id is a 404. */
function requireUserId(req: AuthRequest): string {
  const raw = req.params.userId;
  if (typeof raw !== "string" || raw.trim() === "") {
    throw notFound("Không tìm thấy người dùng này.");
  }
  return raw;
}

// GET /api/v1/users/:userId — public profile (no private PII).
router.get(
  "/:userId",
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = requireUserId(req);

    const [user, aggregates] = await Promise.all([
      prisma.user.findFirst({ where: { id: userId, status: "ACTIVE", emailVerifiedAt: { not: null } } }),
      loadSellerAggregate(userId),
    ]);
    if (!user) throw notFound("Không tìm thấy người dùng này.");

    ok(res, toPublicProfile(user, aggregates));
  }),
);

// GET /api/v1/users/:userId/products — only publicly visible listings:
// ACTIVE/RESERVED/SOLD, not deleted, not blocked, ACTIVE + verified seller.
router.get(
  "/:userId/products",
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = requireUserId(req);

    const paging = parsePagingOnly(req.query);
    const result = await readProducts({ kind: "seller", sellerId: userId,
      offset: offsetOf(paging), limit: paging.page_size }, viewerFrom(req));
    if (!result.ownerExists) throw notFound("Không tìm thấy người dùng này.");
    const items = result.items.map(({ product, context }) => toProductListItem(product, context));
    okList(res, items, pageMeta(paging, result.total));
  }),
);

// GET /api/v1/users/:userId/reviews — public, hidden reviews skipped,
// newest first; the reviewer summary comes from the `reviewer` relation.
router.get(
  "/:userId/reviews",
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = requireUserId(req);

    const owner = await prisma.user.findFirst({
      where: { id: userId, status: "ACTIVE", emailVerifiedAt: { not: null } },
      select: { id: true },
    });
    if (!owner) throw notFound("Không tìm thấy người dùng này.");

    const where = { reviewedUserId: userId, hiddenAt: null };
    const paging = parsePagingOnly(req.query);
    const [reviews, total] = await Promise.all([
      prisma.review.findMany({
        where,
        include: { reviewer: true },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: offsetOf(paging),
        take: paging.page_size,
      }),
      prisma.review.count({ where }),
    ]);

    const items = reviews.map((review) => toReview(review, review.reviewer));
    okList(res, items, pageMeta(paging, total));
  }),
);

export { router as usersRouter };
