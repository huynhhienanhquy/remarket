import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
(async () => {
  const sessions = await p.session.findMany({
    where: { revokedAt: null },
    take: 5,
    orderBy: { createdAt: "desc" }
  });
  console.log('Sessions:', JSON.stringify(sessions, null, 2));
  await p.$disconnect();
})().catch(console.error);