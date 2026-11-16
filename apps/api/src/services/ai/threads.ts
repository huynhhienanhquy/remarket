import { createHmac, randomUUID } from "node:crypto";
import type { AiThread, AiThreadSummary, AiToolResult } from "@remarket/shared";
import { env } from "../../config/env.js";
import { AppError } from "../../middleware/errorHandler.js";
import { notFound } from "../../shared/errors.js";
import { prisma } from "../../utils/prisma.js";
import { filtersSchema, isCurrentFaqSource, redactChatText } from "./marketplace-tools.js";
import type { MarketplaceRunContext } from "./marketplace-tools.js";
import type { Prisma } from "@prisma/client";

const DAY_MS = 86_400_000;
const THREAD_TTL = 30 * DAY_MS;
const HISTORY_MESSAGES = 60;
export const CONTEXT_MESSAGES = 12;
export const MAX_OUTPUT_TOKENS = 600;
export const MAX_STEPS = 2;
const RESERVED_MICROS = Math.ceil(28_000 * env.ai.inputRate + MAX_STEPS * MAX_OUTPUT_TOKENS * env.ai.outputRate);
const MAX_ACTIVE = 4;

function expiration(now: Date) {
  return new Date(now.getTime() + THREAD_TTL);
}

function owned(userId: string, now = new Date()) {
  return { userId, scope: "USER", expiresAt: { gt: now } } as const;
}

function hiddenThread() {
  return notFound("Không tìm thấy phiên trò chuyện.");
}

export function summarize(thread: { id: string; updatedAt: Date; expiresAt: Date }): AiThreadSummary {
  return { id: thread.id, updated_at: thread.updatedAt.toISOString(), expires_at: thread.expiresAt.toISOString() };
}

export async function requireThread(userId: string, id: string) {
  const thread = await prisma.aiThread.findFirst({ where: { ...owned(userId), id } });
  if (!thread) throw hiddenThread();
  return thread;
}

export async function listThreads(userId: string) {
  const threads = await prisma.aiThread.findMany({
    where: owned(userId), orderBy: [{ updatedAt: "desc" }, { id: "desc" }], take: 20,
    select: { id: true, updatedAt: true, expiresAt: true },
  });
  return threads.map(summarize);
}

export async function createThread(userId: string) {
  return prisma.$transaction(async (tx) => {
    const users = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "User" WHERE id = ${userId} AND "deletedAt" IS NULL AND status = 'ACTIVE' FOR UPDATE
    `;
    if (!users.length) throw hiddenThread();
    const now = new Date();
    if (await tx.aiThread.count({ where: owned(userId, now) }) >= 20) {
      throw new AppError("RATE_LIMITED", "Bạn đã có 20 cuộc trò chuyện. Hãy xóa một phiên để tạo phiên mới.", 429);
    }
    return summarize(await tx.aiThread.create({ data: { userId, scope: "USER", expiresAt: expiration(now) } }));
  });
}

export async function readThread(userId: string, id: string): Promise<AiThread> {
  const thread = await requireThread(userId, id);
  const messages = await prisma.aiMessage.findMany({
    where: { threadId: thread.id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: HISTORY_MESSAGES,
  });
  return {
    ...summarize(thread),
    messages: messages.reverse().map((message) => ({
      id: message.id,
      role: message.role === "user" ? "user" : "assistant",
      content: message.content,
      results: (message.results as unknown as AiToolResult[] | null)?.map((result) => result.kind === "faq"
        ? { ...result, sources: result.sources.filter((source) => isCurrentFaqSource(source)) }
        : result),
    })),
  };
}

export async function deleteThread(userId: string, id: string) {
  const deleted = await prisma.aiThread.deleteMany({ where: { ...owned(userId), id } });
  if (!deleted.count) throw hiddenThread();
}

function digest(value: string) {
  return createHmac("sha256", env.jwtSecret).update(value).digest("hex");
}

function utcDay(date: Date) {
  return new Date(Math.floor(date.getTime() / DAY_MS) * DAY_MS);
}

async function reserveBudget(tx: Prisma.TransactionClient, userId: string, ipHash: string, now: Date) {
  const day = utcDay(now);
  await tx.$executeRaw`
    INSERT INTO "AiDailyBudget" ("day", "costMicros") VALUES (${day}, 0) ON CONFLICT ("day") DO NOTHING
  `;
  const budgets = await tx.$queryRaw<Array<{ costMicros: number }>>`
    SELECT "costMicros" FROM "AiDailyBudget" WHERE "day" = ${day} FOR UPDATE
  `;
  const since = new Date(now.getTime() - 60_000);
  const [userCount, ipCount, active] = await Promise.all([
    tx.aiRun.count({ where: { userId, createdAt: { gte: since } } }),
    tx.aiRun.count({ where: { ipHash, createdAt: { gte: since } } }),
    tx.aiThread.count({ where: { scope: "USER", leaseUntil: { gt: now } } }),
  ]);
  if ((budgets[0]?.costMicros ?? 0) + RESERVED_MICROS > env.ai.dailyBudgetMicros ||
      userCount >= 6 || ipCount >= 20 || active >= MAX_ACTIVE) {
    throw new AppError("RATE_LIMITED", "Trợ lý đang đạt giới hạn sử dụng. Hãy thử lại sau hoặc dùng trang tìm kiếm.", 429);
  }
  await tx.aiDailyBudget.update({ where: { day }, data: { costMicros: { increment: RESERVED_MICROS } } });
  return day;
}

export function runMessageIds(runId: string) {
  return { user: `${runId}:user`, assistant: `${runId}:assistant` };
}

export type ClaimedRun = {
  kind: "claimed";
  leaseId: string;
  day: Date;
  startedAt: Date;
  message: string;
  filters: MarketplaceRunContext["filters"];
  history: Array<{ id: string; role: "user" | "assistant"; content: string }>;
};

export async function claimRun(
  userId: string, ip: string, threadId: string, runId: string, input: string,
): Promise<ClaimedRun | { kind: "replay"; thread: AiThread }> {
  const now = new Date();
  const inputHash = digest(input);
  const ipHash = digest(ip);
  const claimed = await prisma.$transaction(async (tx) => {
    const users = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "User" WHERE id = ${userId} AND "deletedAt" IS NULL AND status = 'ACTIVE' FOR SHARE
    `;
    if (!users.length) throw hiddenThread();
    // Lock the thread for retry and lease checks. Concurrent admissions share the budget row.
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "AiThread" WHERE id = ${threadId} AND "userId" = ${userId}
        AND scope = 'USER' AND "expiresAt" > ${now} FOR UPDATE
    `;
    if (!locked.length) throw hiddenThread();
    const thread = await tx.aiThread.findUniqueOrThrow({ where: { id: threadId } });
    const key = { threadId, id: runId };
    const prior = await tx.aiRun.findUnique({ where: { threadId_id: key } });
    if (prior && prior.inputHash !== inputHash) throw new AppError("IDEMPOTENCY_CONFLICT", "Lượt chat đã có nội dung khác.", 409);
    if (prior?.status === "COMPLETED") return null;
    if (thread.leaseUntil && thread.leaseUntil > now) throw new AppError("RETRY_LATER", "Phiên này đang trả lời một câu hỏi.", 409);

    const day = await reserveBudget(tx, userId, ipHash, now);
    const leaseId = randomUUID();
    const attempt = { status: "RUNNING", costMicros: RESERVED_MICROS, createdAt: now, errorCode: null,
      latencyMs: null, inputTokens: null, outputTokens: null, ipHash };
    await tx.aiRun.upsert({
      where: { threadId_id: key }, create: { ...key, ...attempt, userId, inputHash }, update: attempt,
    });
    await tx.aiThread.update({
      where: { id: thread.id }, data: { leaseId, leaseUntil: new Date(now.getTime() + env.ai.timeoutMs + 15_000), expiresAt: expiration(now) },
    });
    const messages = await tx.aiMessage.findMany({
      where: { threadId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: CONTEXT_MESSAGES,
      select: { id: true, role: true, content: true },
    });
    let contextBytes = 7_000;
    const history = [];
    for (const message of messages) {
      contextBytes -= Buffer.byteLength(message.content);
      if (contextBytes < 0) break;
      history.push({ ...message, role: message.role === "user" ? "user" as const : "assistant" as const });
    }
    return {
      kind: "claimed" as const, leaseId, day, startedAt: now, message: redactChatText(input),
      filters: filtersSchema.parse(thread.filters),
      history: history.reverse(),
    };
  });
  return claimed ?? { kind: "replay", thread: await readThread(userId, threadId) };
}

export async function finishRun(
  threadId: string, runId: string, claim: ClaimedRun, context: MarketplaceRunContext, answer: string, errorCode?: string,
) {
  return prisma.$transaction(async (tx) => {
    const released = await tx.aiThread.updateMany({
      where: { id: threadId, leaseId: claim.leaseId, leaseUntil: { gt: new Date() } },
      data: { leaseId: null, leaseUntil: null, ...(errorCode ? {} : { filters: { ...context.filters } }) },
    });
    if (!released.count) return false;
    const cost = context.inputTokens !== undefined && context.outputTokens !== undefined
      ? Math.ceil(context.inputTokens * env.ai.inputRate + context.outputTokens * env.ai.outputRate)
      : RESERVED_MICROS;
    const charged = errorCode ? Math.max(cost, RESERVED_MICROS) : cost;
    await tx.aiDailyBudget.update({
      where: { day: claim.day }, data: { costMicros: { increment: charged - RESERVED_MICROS } },
    });
    await tx.aiRun.update({
      where: { threadId_id: { threadId, id: runId } },
      data: {
        status: errorCode ? "FAILED" : "COMPLETED", costMicros: charged, errorCode,
        latencyMs: Date.now() - claim.startedAt.getTime(), inputTokens: context.inputTokens, outputTokens: context.outputTokens,
      },
    });
    if (!errorCode) {
      const ids = runMessageIds(runId);
      await tx.aiMessage.createMany({
        data: [
          { threadId, id: ids.user, role: "user", content: claim.message, createdAt: claim.startedAt },
          { threadId, id: ids.assistant, role: "assistant", content: redactChatText(answer).slice(0, 1_800),
            results: context.results.map((result) => {
              if (result.kind === "search") return { ...result, filters: { ...result.filters } };
              if (result.kind === "faq") return { ...result, sources: result.sources.map((source) => ({ ...source })) };
              return { ...result };
            }), createdAt: new Date() },
        ],
      });
    }
    return true;
  });
}
