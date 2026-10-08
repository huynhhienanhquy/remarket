import { Router } from "express";
import { PROVINCES } from "@remarket/shared";
import type { Province } from "@remarket/shared";
import { prisma } from "../utils/prisma.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { ok } from "../shared/api-response.js";

/**
 * Geography lookup used by every listing/profile form (detail-project 9.4).
 *
 * The seed mirrors the versioned shared dataset into `Province`. An empty
 * table falls back to that same dataset so a fresh development database keeps
 * serving the canonical `{ code, name }` values before seeding.
 */

const router = Router();

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const rows = await prisma.province.findMany({
      orderBy: [{ name: "asc" }, { code: "asc" }],
    });

    if (rows.length > 0) {
      const provinces: Province[] = rows.map((row) => ({ code: row.code, name: row.name }));
      ok(res, provinces);
      return;
    }

    const fallback: Province[] = PROVINCES.map((province) => ({
      code: province.code,
      name: province.name,
    }));
    ok(res, fallback);
  }),
);

export { router as provincesRouter };
