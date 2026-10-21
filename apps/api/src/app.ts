import "dotenv/config";
import express from "express";
import type { Request, Response } from "express";
import cors from "cors";
import helmet from "helmet";
import { API_ERROR_CODES } from "@remarket/shared";
import { env } from "./config/env.js";
import { requestIdMiddleware } from "./middleware/request-id.js";
import { errorHandler, asyncHandler, AppError } from "./middleware/errorHandler.js";
import { authMiddleware, requireRole } from "./middleware/auth.js";
import { prisma } from "./utils/prisma.js";
import { collectWorkerMetrics, workerSnapshot } from "./jobs/runner.js";
import { createGlobalRateLimit } from "./middleware/rate-limit.js";
import { mountWeb } from "./web.js";

import { authRouter } from "./routes/auth.js";
import { categoriesRouter } from "./routes/categories.js";
import { provincesRouter } from "./routes/provinces.js";
import { accountProductsRouter, productsRouter } from "./routes/products.js";
import { uploadsRouter } from "./routes/uploads.js";
import { favoritesRouter } from "./routes/favorites.js";
import { cartRouter } from "./routes/cart.js";
import { checkoutRouter } from "./routes/checkout.js";
import { ordersRouter } from "./routes/orders.js";
import { chatRouter } from "./routes/chat.js";
import { reportsRouter } from "./routes/reports.js";
import { notificationsRouter } from "./routes/notifications.js";
import { supportRouter } from "./routes/support.js";
import { usersRouter } from "./routes/profiles.js";
import { adminRouter } from "./routes/admin.js";
import { nativeAuthOnly } from "./services/auth-transport.js";
import { mobileRouter } from "./routes/mobile.js";

/**
 * Express app (detail-project 3). Middleware order matters:
 * request-id -> security -> CORS -> parser -> rate limit -> routes.
 */
export function createApp(options: { webRoot?: string } = {}): express.Express {
  const app = express();

  app.disable("x-powered-by");
  if (env.trustProxyHops > 0) app.set("trust proxy", env.trustProxyHops);
  app.use(requestIdMiddleware);
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        "img-src": ["'self'", "data:", "blob:", ...(env.storage.supabaseUrl ? [env.storage.supabaseUrl] : [])],
        "connect-src": ["'self'", env.publicWebUrl.replace(/^http/, "ws")],
      },
    },
  }));
  app.use(
    cors({
      origin: env.corsOrigins,
      credentials: true,
      allowedHeaders: ["Content-Type", "Authorization", "Idempotency-Key", "X-Request-Id", "X-Session-Scope"],
      exposedHeaders: ["X-Request-Id"],
    }),
  );
  // detail-project 18: 64 KB JSON body cap.
  app.use(express.json({ limit: "64kb" }));
  app.use(express.urlencoded({ extended: false, limit: "64kb" }));

  app.use(createGlobalRateLimit());

  // Health probes: /health/live never touches the DB (detail-project 18).
  app.get("/health/live", (_req: Request, res: Response) => {
    res.json({ status: "ok", live: true });
  });
  app.get(
    "/health/ready",
    asyncHandler(async (_req: Request, res: Response) => {
      let timeout: NodeJS.Timeout | undefined;
      try {
        await Promise.race([
          prisma.$queryRaw`SELECT 1`,
          new Promise<never>((_resolve, reject) => {
            timeout = setTimeout(
              () => reject(new AppError("NOT_READY", "Database readiness check timed out.", 503)),
              env.databaseHealthTimeoutMs,
            );
          }),
        ]);
      } catch (error) {
        if (error instanceof AppError) throw error;
        throw new AppError("NOT_READY", "Database readiness check failed.", 503);
      } finally {
        if (timeout) clearTimeout(timeout);
      }
      res.json({ status: "ok", ready: true });
    }),
  );
  app.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });
  app.get(
    "/health/worker",
    asyncHandler(async (_req: Request, res: Response) => {
      const worker = await workerSnapshot();
      const lastSuccess = worker.last_success_at ? Date.parse(worker.last_success_at) : Number.NaN;
      const staleAfterMs = Math.max(env.workerIntervalMs * 3, 180_000);
      const healthy = Number.isFinite(lastSuccess) && Date.now() - lastSuccess <= staleAfterMs;
      res.status(healthy ? 200 : 503).json({
        status: healthy ? "ok" : "degraded",
        worker,
        metrics: await collectWorkerMetrics(),
      });
    }),
  );

  const api = express.Router();

  // Public
  api.use("/auth/mobile", nativeAuthOnly, authRouter);
  api.use("/auth", authRouter);
  api.use("/categories", categoriesRouter);
  api.use("/provinces", provincesRouter);
  api.use("/products", productsRouter);
  api.use("/users", usersRouter);
  // POST authenticates inside the router; guarded GET URLs can be rendered by
  // guests for attached public product/avatar images.
  api.use("/uploads", uploadsRouter);

  // Authenticated
  api.use("/favorites", authMiddleware, favoritesRouter);
  api.use("/mobile", authMiddleware, mobileRouter);
  api.use("/cart", authMiddleware, cartRouter);
  api.use("/checkout", authMiddleware, checkoutRouter);
  api.use("/orders", authMiddleware, ordersRouter);
  api.use("/conversations", authMiddleware, chatRouter);
  api.use("/reports", authMiddleware, reportsRouter);
  api.use("/notifications", authMiddleware, notificationsRouter);
  api.use("/support", authMiddleware, supportRouter);
  // Own listing management sits behind its own mount (detail-project 9.4).
  api.use("/account/products", authMiddleware, accountProductsRouter);

  // Admin: ACTIVE admin only; every mutation also writes an audit row.
  api.use("/admin", authMiddleware, requireRole("ADMIN"), adminRouter);

  app.use("/api/v1", api);

  const webRoot = options.webRoot ?? (env.serveWeb ? env.webDistPath : undefined);
  if (webRoot) mountWeb(app, webRoot);

  // Unknown endpoint -> the frontend expects the standard error envelope.
  app.use((req, res) => {
    res.status(404).json({
      success: false,
      error: { code: API_ERROR_CODES.NOT_FOUND, message: `Không tồn tại endpoint ${req.method} ${req.path}.` },
      meta: { request_id: res.locals.requestId ?? crypto.randomUUID() },
    });
  });

  app.use(errorHandler);
  return app;
}
