import { Router } from "express";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import type { AuthRequest } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { prisma } from "../utils/prisma.js";
import { ok, okList } from "../shared/api-response.js";
import { adminActor } from "../shared/admin-helpers.js";
import { offsetOf, pageMeta, parsePaging } from "../shared/pagination.js";
import { approveEmailVerification, toEmailVerificationRequest } from "../services/email-verification.js";

const router = Router();
router.get("/", asyncHandler(async (req, res) => {
  const query = z.object({
    status: z.enum(["PENDING", "APPROVED", "ALL"]).default("PENDING"),
    page: z.unknown().optional(), page_size: z.unknown().optional(),
  }).strict().parse(req.query);
  const paging = parsePaging(query);
  const where: Prisma.UserWhereInput = {
    emailVerificationRequestedAt: { not: null },
    ...(query.status === "PENDING" ? { emailVerifiedAt: null } : {}),
    ...(query.status === "APPROVED" ? { emailVerifiedAt: { not: null } } : {}),
  };
  const [users, total] = await Promise.all([
    prisma.user.findMany({ where, orderBy: [{ emailVerificationRequestedAt: "desc" }, { id: "desc" }], skip: offsetOf(paging), take: paging.page_size }),
    prisma.user.count({ where }),
  ]);
  okList(res, users.flatMap((user) => { const item = toEmailVerificationRequest(user); return item ? [item] : []; }), pageMeta(paging, total));
}));
router.post("/:id/approve", asyncHandler(async (req: AuthRequest, res) => {
  const id = z.string().uuid().parse(req.params.id);
  z.object({}).strict().parse(req.body);
  const actor = adminActor(req);
  const result = await prisma.$transaction((tx) => approveEmailVerification(tx, id, actor));
  ok(res, result);
}));
export { router as adminEmailVerificationsRouter };
