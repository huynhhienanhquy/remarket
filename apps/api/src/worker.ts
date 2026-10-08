import "dotenv/config";
import { env } from "./config/env.js";
import { startJobRunner } from "./jobs/runner.js";
import { backgroundPrisma as prisma } from "./utils/background-prisma.js";

const stop = startJobRunner(env.workerIntervalMs, env.outboxIntervalMs);

async function shutdown(): Promise<void> {
  stop();
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
