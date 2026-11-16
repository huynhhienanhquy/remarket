import type { AdminWorkspaceSummary } from "@remarket/shared";
import { prisma } from "../utils/prisma.js";

function ratio(part: number, total: number) {
  return total === 0 ? null : (part / total) * 100;
}

type SummaryLoaders = {
  [K in keyof AdminWorkspaceSummary]: (start: Date, end: Date) => Promise<AdminWorkspaceSummary[K]>;
};

export const adminSummaryLoaders: SummaryLoaders = {
  async users() {
    const [total, active, pending_email, locked] = await Promise.all([
      prisma.user.count({ where: { deletedAt: null } }),
      prisma.user.count({ where: { deletedAt: null, status: "ACTIVE", emailVerifiedAt: { not: null } } }),
      prisma.user.count({ where: { deletedAt: null, status: "ACTIVE", emailVerifiedAt: null } }),
      prisma.user.count({ where: { deletedAt: null, status: "LOCKED" } }),
    ]);
    return { total, active, pending_email, locked };
  },
  async reports(start, end) {
    const [counts, handled_today] = await Promise.all([
      prisma.report.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.report.count({ where: { handledAt: { gte: start, lte: end } } }),
    ]);
    const resolved = counts.find(row => row.status === "RESOLVED")?._count._all ?? 0;
    const rejected = counts.find(row => row.status === "REJECTED")?._count._all ?? 0;
    return { resolved, handled_today, confirmed_rate: ratio(resolved, resolved + rejected) };
  },
  async reviews() {
    const [total, visible, low_rating_visible] = await Promise.all([
      prisma.review.count(),
      prisma.review.aggregate({ where: { hiddenAt: null }, _avg: { rating: true }, _count: { _all: true } }),
      prisma.review.count({ where: { hiddenAt: null, rating: { lte: 2 } } }),
    ]);
    return { average: visible._avg.rating, total, low_rating_visible, public_rate: ratio(visible._count._all, total) };
  },
  async support(start, end) {
    const [resolved_today, [sample]] = await Promise.all([
      prisma.supportTicket.count({ where: { resolvedAt: { gte: start, lte: end } } }),
      prisma.$queryRaw<Array<{ average: number | null }>>`
        SELECT AVG(EXTRACT(EPOCH FROM (reply."createdAt" - ticket."createdAt")) / 60)::float8 AS average
        FROM "SupportTicket" ticket
        JOIN LATERAL (
          SELECT "createdAt" FROM "SupportMessage"
          WHERE "ticketId" = ticket.id AND role = 'ADMIN'
          ORDER BY "createdAt" LIMIT 1
        ) reply ON reply."createdAt" >= ${start} AND reply."createdAt" <= ${end}
      `,
    ]);
    return { resolved_today, first_reply_minutes: sample?.average ?? null };
  },
  async email(start, end) {
    const [approved_today, requested, approved] = await Promise.all([
      prisma.user.count({ where: { emailVerificationRequestedAt: { not: null }, emailVerifiedAt: { gte: start, lte: end } } }),
      prisma.user.count({ where: { emailVerificationRequestedAt: { not: null } } }),
      prisma.user.count({ where: { emailVerificationRequestedAt: { not: null }, emailVerifiedAt: { not: null } } }),
    ]);
    return { approved_today, approval_rate: ratio(approved, requested) };
  },
  async audit(start, end) {
    const createdAt = { gte: start, lte: end };
    const [today, admin_actions_today, total, [storage]] = await Promise.all([
      prisma.auditLog.count({ where: { createdAt } }),
      prisma.auditLog.count({ where: { createdAt, actorType: "ADMIN" } }),
      prisma.auditLog.count(),
      prisma.$queryRaw<Array<{ bytes: bigint }>>`SELECT pg_total_relation_size('"AuditLog"') AS bytes`,
    ]);
    return { today, admin_actions_today, total, storage_bytes: storage ? Number(storage.bytes) : undefined };
  },
};
