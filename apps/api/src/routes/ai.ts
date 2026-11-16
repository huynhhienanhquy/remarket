import { randomUUID } from "node:crypto";
import { Router } from "express";
import type { NextFunction, Response } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import type { AuthRequest } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { ok } from "../shared/api-response.js";
import { notFound } from "../shared/errors.js";
import { searchPublicProducts } from "../shared/product-search.js";
import { viewerFrom } from "../shared/viewer.js";
import { claimRun, createThread, deleteThread, listThreads, readThread, requireThread } from "../services/ai/threads.js";
import { redactChatText } from "../services/ai/marketplace-tools.js";

const id = z.string().uuid();
const userMessage = z.object({
  id: z.string().min(1).max(100),
  role: z.literal("user"),
  content: z.string().trim().min(1).max(1_200),
});

type Runtime = typeof import("../services/ai/runtime.js");
let runtime: Promise<Runtime> | undefined;
function loadRuntime() {
  process.env.COPILOTKIT_TELEMETRY_DISABLED = "true";
  runtime ??= import("../services/ai/runtime.js").catch((error: unknown) => {
    runtime = undefined;
    throw error;
  });
  return runtime;
}

export const aiRouter = Router();
const runtimePath = "/copilotkit/agent/marketplace";
aiRouter.get("/config", (_req, res) => { ok(res, { enabled: env.ai.enabled }); });
aiRouter.use((_req, _res, next) => {
  if (!env.ai.enabled) return next(notFound("Trợ lý ReMarket hiện chưa khả dụng."));
  next();
});
aiRouter.get("/threads", asyncHandler(async (req: AuthRequest, res) =>
  ok(res, await listThreads(req.user!.id))));
aiRouter.post("/threads", asyncHandler(async (req: AuthRequest, res) =>
  ok(res, await createThread(req.user!.id), 201)));
aiRouter.get("/threads/:id", asyncHandler(async (req: AuthRequest, res) =>
  ok(res, await readThread(req.user!.id, id.parse(req.params.id)))));
aiRouter.delete("/threads/:id", asyncHandler(async (req: AuthRequest, res) => {
  const threadId = id.parse(req.params.id);
  await deleteThread(req.user!.id, threadId);
  const loaded = await runtime?.catch(() => undefined);
  loaded?.marketplaceRunner.cancel(req.user!.id, threadId);
  return ok(res, { deleted: true });
}));
aiRouter.get("/copilotkit/info", handleRuntime("info"));
aiRouter.post(`${runtimePath}/run`, handleRuntime("run"));
aiRouter.post(`${runtimePath}/connect`, handleRuntime("connect"));
aiRouter.post(`${runtimePath}/stop/:threadId`, handleRuntime("stop"));
aiRouter.post("/products/resolve", asyncHandler(async (req: AuthRequest, res) => {
  const { ids } = z.object({ ids: z.array(id).max(6) }).strict().parse(req.body);
  const uniqueIds = [...new Set(ids)];
  const { items } = await searchPublicProducts({
    productIds: uniqueIds, keyword: "", minPrice: null, maxPrice: null, sort: "newest", offset: 0, limit: 6,
  }, viewerFrom(req));
  const byId = new Map(items.map((item) => [item.id, item]));
  return ok(res, uniqueIds.flatMap((productId) => {
    const item = byId.get(productId);
    return item ? [item] : [];
  }));
}));

function handleRuntime(operation: "info" | "run" | "connect" | "stop") {
  return asyncHandler(async (req: AuthRequest, res: Response, next: NextFunction) => {
    const userId = req.user!.id;
    const viewer = viewerFrom(req);
    const { marketplaceHandler, runtimeAccess } = await loadRuntime();
    const access = { userId, viewer };
    res.setHeader("X-Accel-Buffering", "no");
    if (operation === "info") {
      return runtimeAccess.run(access, () => marketplaceHandler(req, res, next));
    }
    if (operation === "run") {
      const input = z.object({ threadId: id, runId: id, messages: z.array(z.unknown()).min(1).max(120) }).parse(req.body);
      const message = userMessage.parse(input.messages.at(-1));
      const claim = await claimRun(userId, req.ip ?? "", input.threadId, input.runId, message.content);
      req.body = {
        threadId: input.threadId, runId: input.runId, state: {}, context: [], tools: [], forwardedProps: {},
        messages: [{ ...message, content: redactChatText(message.content) }],
      };
      return runtimeAccess.run({ ...access, threadId: input.threadId, runId: input.runId, claim },
        () => marketplaceHandler(req, res, next));
    }
    const threadId = id.parse(operation === "stop" ? req.params.threadId : req.body?.threadId);
    const history = operation === "connect" ? await readThread(userId, threadId) : undefined;
    if (operation === "stop") await requireThread(userId, threadId);
    req.body = operation === "stop"
      ? z.object({ runId: id.optional() }).strict().parse(req.body ?? {})
      : { threadId, runId: randomUUID(), messages: [], state: {}, context: [], tools: [], forwardedProps: {} };
    return runtimeAccess.run({ ...access, threadId, history }, () => marketplaceHandler(req, res, next));
  });
}
