import assert from "node:assert/strict";
import { prisma } from "../src/utils/prisma.js";

assert.match(new URL(process.env.TEST_DATABASE_URL!).searchParams.get("schema") ?? "", /^remarket_verify_[a-f0-9]{32}$/);
// Synthetic rows belong exclusively to the disposable schema created by the harness.
await prisma.$executeRaw`
  INSERT INTO "OutboxEvent" ("id", "eventType", "aggregateId", "dedupeKey", "payload", "createdAt", "nextAttemptAt", "processedAt", "relaySequence")
  SELECT 'plan-' || n, 'order.updated', 'plan', 'plan-' || n, '{}'::jsonb,
    NOW() - INTERVAL '90 days', NOW(), NOW() - INTERVAL '60 days' + n * INTERVAL '1 second', nextval('"OutboxRelaySequence"')
  FROM generate_series(1, 20000) n
`;
await prisma.$executeRaw`ANALYZE "OutboxEvent"`;
const queries = {
  relay: 'SELECT "id", "eventType", "aggregateId", "payload", "relaySequence" FROM "OutboxEvent" WHERE "processedAt" IS NOT NULL AND "eventType" NOT IN (\'email.auth\', \'storage.delete\') AND "relaySequence" > 10000 ORDER BY "relaySequence" LIMIT 100',
  retention: 'SELECT "id", "dedupeKey", "createdAt" FROM "OutboxEvent" WHERE "processedAt" < NOW() - INTERVAL \'30 days\' AND "lockedAt" IS NULL ORDER BY "processedAt", "id" FOR UPDATE SKIP LOCKED LIMIT 500',
};
for (const [name, query] of Object.entries(queries)) {
  const plan = await prisma.$queryRawUnsafe<Array<{ "QUERY PLAN": string }>>(`EXPLAIN (ANALYZE, BUFFERS) ${query}`);
  console.log(`QUERY PLAN ${name}\n${plan.map((row) => row["QUERY PLAN"]).join("\n")}`);
}
await prisma.$executeRaw`CREATE INDEX "verify_outbox_retention_idx" ON "OutboxEvent" ("processedAt", "id") WHERE "lockedAt" IS NULL AND "processedAt" IS NOT NULL`;
const improved = await prisma.$queryRawUnsafe<Array<{ "QUERY PLAN": string }>>(`EXPLAIN (ANALYZE, BUFFERS) ${queries.retention}`);
console.log(`QUERY PLAN retention candidate\n${improved.map((row) => row["QUERY PLAN"]).join("\n")}`);
await prisma.$executeRaw`DROP INDEX "verify_outbox_retention_idx"`;
await prisma.outboxEvent.deleteMany({ where: { aggregateId: "plan" } });
await prisma.$disconnect();
