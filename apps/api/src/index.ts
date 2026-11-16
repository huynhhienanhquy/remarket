import "dotenv/config";
import { createServer } from "node:http";
import { env } from "./config/env.js";
import { createApp } from "./app.js";
import { prisma, warmHttpDatabasePool } from "./utils/prisma.js";
import { backgroundPrisma } from "./utils/background-prisma.js";
import { startJobRunner } from "./jobs/runner.js";
import { attachRealtime } from "./realtime/server.js";
import { startRealtimeRelay } from "./realtime/relay.js";
import { disconnectDatabaseClient } from "./utils/database-client.js";

/** HTTP bootstrap (detail-project 3.1): listen, then shut down gracefully. */
const app = createApp();
const server = createServer(app);
const realtime = attachRealtime(server);
const [, stopRealtimeRelay] = await Promise.all([warmHttpDatabasePool(), startRealtimeRelay()]);
let stopJobs: () => void = () => undefined;
server.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Không thể khởi động API vì cổng ${env.port} đang được sử dụng. Dừng phiên API cũ bằng Ctrl+C rồi chạy lại pnpm dev.`);
  } else {
    console.error("Không thể mở cổng API:", error.message);
  }
  void shutdown("HTTP server error", 1);
});
server.listen(env.port, "0.0.0.0", () => {
  console.log(`ReMarket API listening on http://localhost:${env.port}`);
  console.log(`  health:  http://localhost:${env.port}/health/ready`);
  console.log(`  api:     http://localhost:${env.port}/api/v1`);
  if (env.runJobs) {
    stopJobs = startJobRunner(env.workerIntervalMs, env.outboxIntervalMs, env.mobilePushIntervalMs);
  }
});

let shuttingDown = false;

async function shutdown(signal: string, exitCode = 0): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  stopJobs();
  stopRealtimeRelay();
  console.log(`${signal} received, shutting down...`);
  // Bound cleanup even when a socket or database connection cannot close.
  setTimeout(() => process.exit(1), 10_000).unref();

  await realtime.close();
  server.close(async () => {
    try {
      await Promise.all([disconnectDatabaseClient(prisma), disconnectDatabaseClient(backgroundPrisma)]);
    } finally {
      process.exit(exitCode);
    }
  });
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection:", reason instanceof Error ? reason.message : reason);
});

export default app;
