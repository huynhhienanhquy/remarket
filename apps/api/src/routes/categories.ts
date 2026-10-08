import { Router } from "express";
import { prisma } from "../utils/prisma.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { ok } from "../shared/api-response.js";
import { toCategoryNode } from "../shared/dto-mappers.js";
import type { CategoryRow } from "../shared/dto-mappers.js";

/**
 * Public category tree (detail-project 9.4): `GET /categories` returns the
 * roots of the ACTIVE tree with nested `children`, every level sorted by name.
 * Inactive categories disappear together with their whole subtree, so the UI
 * never offers a category a product could not be published under.
 */

const router = Router();

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const rows: CategoryRow[] = await prisma.category.findMany({
      where: { status: "ACTIVE" },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });

    const byParent = new Map<string | null, CategoryRow[]>();
    for (const row of rows) {
      const bucket = byParent.get(row.parentId);
      if (bucket) bucket.push(row);
      else byParent.set(row.parentId, [row]);
    }

    // Attach children in memory; the mapper walks the tree recursively.
    for (const row of rows) {
      const children = byParent.get(row.id);
      if (children && children.length > 0) row.children = children;
    }

    const roots = byParent.get(null) ?? [];
    ok(res, roots.map(toCategoryNode));
  }),
);

export { router as categoriesRouter };
