const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
(async () => {
  const tables = await p.$queryRawUnsafe(
    "select table_name as name from information_schema.tables where table_schema='public' order by 1",
  );
  console.log("TABLES:", JSON.stringify(tables.map((t) => t.name)));
  const counts = {};
  for (const t of tables.map((t) => t.name)) {
    const r = await p.$queryRawUnsafe(`select count(*)::int as c from "${t}"`);
    counts[t] = r[0].c;
  }
  console.log("COUNTS:", JSON.stringify(counts, null, 1));
  await p.$disconnect();
})().catch((e) => {
  console.error("ERR", e.message);
  process.exit(1);
});
