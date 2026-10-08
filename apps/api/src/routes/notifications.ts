import { Router } from "express";
import { z } from "zod";
import { NOTIFICATION_TYPES } from "@remarket/shared";
import type { PageMeta } from "@remarket/shared";
import { prisma } from "../utils/prisma.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import type { AuthRequest, AuthUser } from "../middleware/auth.js";
import { notFound, unauthorized } from "../shared/errors.js";
import { ok, okList } from "../shared/api-response.js";
import { offsetOf, pageMeta, parsePaging } from "../shared/pagination.js";
import { toNotification } from "../shared/dto-mappers.js";

/**
 * Notifications (detail-project 14.3).
 *
 * Every query is scoped to the caller, so another user's notification is
 * indistinguishable from a missing one (404). Marking read is idempotent and
 * `read-all` freezes a cutoff first so rows created afterwards stay unread.
 */

const router = Router();

function currentUser(req: AuthRequest): AuthUser {
  if (!req.user) throw unauthorized();
  return req.user;
}

/** `unread=true` (frontend adapter) and `unread_only=true` both filter. */
function truthyFlag(value: string | undefined): boolean {
  return value === "true" || value === "1";
}

const listQuerySchema = z
  .object({
    type: z.enum(NOTIFICATION_TYPES, { message: "Loại thông báo không hợp lệ." }).optional(),
    unread: z.string({ message: "Tham số lọc không hợp lệ." }).optional(),
    unread_only: z.string({ message: "Tham số lọc không hợp lệ." }).optional(),
    page: z.unknown().optional(),
    page_size: z.unknown().optional(),
  })
  .strict();

// GET /api/v1/notifications
router.get(
  "/",
  asyncHandler(async (req: AuthRequest, res) => {
    const user = currentUser(req);
    const query = listQuerySchema.parse(req.query);
    const paging = parsePaging(req.query);
    const unreadOnly = truthyFlag(query.unread) || truthyFlag(query.unread_only);

    const where = {
      userId: user.id,
      ...(query.type ? { type: query.type } : {}),
      ...(unreadOnly ? { readAt: null } : {}),
    };

    const [notifications, total, unread] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: offsetOf(paging),
        take: paging.page_size,
      }),
      prisma.notification.count({ where }),
      prisma.notification.count({ where: { userId: user.id, readAt: null } }),
    ]);

    const meta: PageMeta & { unread: number } = { ...pageMeta(paging, total), unread };
    okList(res, notifications.map(toNotification), meta);
  }),
);

// GET /api/v1/notifications/unread-count
// Returns bare number per NotificationsApi.unreadCount(): Promise<number>
router.get(
  "/unread-count",
  asyncHandler(async (req: AuthRequest, res) => {
    const user = currentUser(req);
    const unread = await prisma.notification.count({
      where: { userId: user.id, readAt: null },
    });
    return ok(res, unread);
  }),
);

// POST /api/v1/notifications/read-all
router.post(
  "/read-all",
  asyncHandler(async (req: AuthRequest, res) => {
    const user = currentUser(req);
    const cutoff = new Date();

    const result = await prisma.notification.updateMany({
      where: { userId: user.id, readAt: null, createdAt: { lte: cutoff } },
      data: { readAt: cutoff },
    });
    const unread = await prisma.notification.count({
      where: { userId: user.id, readAt: null },
    });

    ok(res, { unread, updated: result.count });
  }),
);

// POST /api/v1/notifications/:id/read
router.post(
  "/:id/read",
  asyncHandler(async (req: AuthRequest, res) => {
    const user = currentUser(req);
    const id = req.params.id;
    if (!id) throw notFound("Không tìm thấy thông báo này.");

    const notification = await prisma.notification.findFirst({
      where: { id, userId: user.id },
      select: { id: true, readAt: true },
    });
    if (!notification) throw notFound("Không tìm thấy thông báo này.");

    let updated = 0;
    if (notification.readAt === null) {
      const result = await prisma.notification.updateMany({
        where: { id, userId: user.id, readAt: null },
        data: { readAt: new Date() },
      });
      updated = result.count;
    }

    const unread = await prisma.notification.count({
      where: { userId: user.id, readAt: null },
    });

    ok(res, { unread, updated });
  }),
);

export { router as notificationsRouter };
