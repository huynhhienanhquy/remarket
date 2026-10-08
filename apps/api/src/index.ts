import "dotenv/config";
import { createServer } from "node:http";
import { env } from "./config/env.js";
import { createApp } from "./app.js";
import { prisma } from "./utils/prisma.js";
import { startJobRunner } from "./jobs/runner.js";
import { attachRealtime } from "./realtime/server.js";
import { startRealtimeRelay } from "./realtime/relay.js";

/** HTTP bootstrap (detail-project 3.1): listen, then shut down gracefully. */
const app = createApp();
const server = createServer(app);
const realtime = attachRealtime(server);
server.listen(env.port, () => {
  console.log(`ReMarket API listening on http://localhost:${env.port}`);
  console.log(`  health:  http://localhost:${env.port}/health/ready`);
  console.log(`  api:     http://localhost:${env.port}/api/v1`);
});
const stopJobs = env.runJobs
  ? startJobRunner(env.workerIntervalMs, env.outboxIntervalMs)
  : () => undefined;
const stopRealtimeRelay = startRealtimeRelay();

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  stopJobs();
  stopRealtimeRelay();
  console.log(`${signal} received, shutting down...`);

  await realtime.close();
  server.close(async () => {
    try {
      await prisma.$disconnect();
    } finally {
      process.exit(0);
    }
  });

  // Do not hang forever on a stuck keep-alive connection.
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection:", reason instanceof Error ? reason.message : reason);
});

export default app;
