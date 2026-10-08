import type { Prisma } from "@prisma/client";
import type { AuthRequest } from "../middleware/auth.js";
import { unauthorized, validationError } from "./errors.js";
import { prisma } from "../utils/prisma.js";

export interface AdminActor {
  id: string;
  fullName: string;
}

export interface AuditEntry {
  actorId: string | null;
  actorName: string | null;
  actorType?: "USER" | "ADMIN" | "SYSTEM";
  action: string;
  entityType: string;
  entityId: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown>;
}

export async function writeAudit(tx: Prisma.TransactionClient, entry: AuditEntry): Promise<void> {
  await tx.auditLog.create({
    data: {
      actorId: entry.actorId,
      actorName: entry.actorName,
      actorType: entry.actorType ?? "ADMIN",
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      reason: entry.reason ?? null,
      metadata: (entry.metadata ?? {}) as Prisma.InputJsonValue,
    },
  });
}

export function adminActor(req: AuthRequest): AdminActor {
  const user = req.user;
  if (!user) throw unauthorized();
  return { id: user.id, fullName: user.fullName };
}

export function textQuery(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

/** Moderation actor filters include block/unblock as well as approve/reject. */
export async function administeredEntityIds(
  entityType: "user" | "product" | "review" | "category",
  actorId?: string,
  from?: string,
  to?: string,
): Promise<string[] | undefined> {
  if (!actorId && !from && !to) return undefined;
  const entries = await prisma.auditLog.findMany({
    where: {
      entityType,
      actorType: "ADMIN",
      ...(actorId ? { actorId } : {}),
      createdAt: adminDateRange(from, to),
    },
    select: { entityId: true },
    distinct: ["entityId"],
  });
  return entries.flatMap((entry) => entry.entityId ? [entry.entityId] : []);
}

/** Inclusive local-date bounds accepted by every paginated admin list. */
export function adminDateRange(
  from: string | undefined,
  to: string | undefined,
): Prisma.DateTimeFilter | undefined {
  if (from === undefined && to === undefined) return undefined;
  const parseDay = (value: string, field: "from" | "to"): Date => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw validationError("Khoảng ngày chưa hợp lệ.", { [field]: "Định dạng YYYY-MM-DD." });
    }
    const calendarDay = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(calendarDay.getTime()) || calendarDay.toISOString().slice(0, 10) !== value) {
      throw validationError("Khoảng ngày chưa hợp lệ.", { [field]: "Ngày không tồn tại." });
    }
    return new Date(`${value}T00:00:00.000+07:00`);
  };
  const start = from === undefined ? undefined : parseDay(from, "from");
  const end = to === undefined ? undefined : parseDay(to, "to");
  if (end) end.setTime(end.getTime() + 24 * 60 * 60 * 1000 - 1);
  if (start && end && start > end) {
    throw validationError("Khoảng ngày chưa hợp lệ.", { from: "Ngày bắt đầu phải trước hoặc bằng ngày kết thúc." });
  }
  return { ...(start ? { gte: start } : {}), ...(end ? { lte: end } : {}) };
}
