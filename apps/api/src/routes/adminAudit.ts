import type { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../utils/prisma.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { okList } from "../shared/api-response.js";
import { offsetOf, pageMeta, parsePaging } from "../shared/pagination.js";
import { toAuditLogItem } from "../shared/dto-mappers.js";
import { adminDateRange } from "../shared/admin-helpers.js";

/**
 * Audit trail reader (detail-project 15): newest first, paginated, optional
 * `action` / `entity_type` filters. `metadata` is a Prisma `Json` value and is
 * passed through untouched as `Record<string, unknown>`.
 */

const router = Router();

const listQuery = z
  .object({
    action: z.string().trim().max(100).optional(),
    entity_type: z.string().trim().max(50).optional(),
    entity_id: z.string().trim().max(64).optional(),
    actor_id: z.string().trim().max(64).optional(),
    from: z.string().optional(),
    to: z.string().optional(),
    page: z.string().optional(),
    page_size: z.string().optional(),
  })
  .strict();

// GET /api/v1/admin/audit-logs?action&entity_type&page&page_size
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const query = listQuery.parse(req.query);
    const paging = parsePaging(req.query);

    const where: Prisma.AuditLogWhereInput = {};
    if (query.action !== undefined) where.action = query.action;
    if (query.entity_type !== undefined) where.entityType = query.entity_type;
    if (query.entity_id !== undefined) where.entityId = query.entity_id;
    if (query.actor_id !== undefined) where.actorId = query.actor_id;
    where.createdAt = adminDateRange(query.from, query.to);

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: offsetOf(paging),
        take: paging.page_size,
      }),
      prisma.auditLog.count({ where }),
    ]);

    okList(res, logs.map((log) => toAuditLogItem(log)), pageMeta(paging, total));
  }),
);

export { router as adminAuditRouter };
