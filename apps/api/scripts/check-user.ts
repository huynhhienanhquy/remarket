import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const email = process.env.CHECK_USER_EMAIL;
if (!email) throw new Error("Set CHECK_USER_EMAIL to the account to inspect");
const user = await p.user.findUnique({ where: { email } });
console.log('User:', JSON.stringify({ id: user?.id, email: user?.email, emailVerifiedAt: user?.emailVerifiedAt, status: user?.status }, null, 2));
await p.$disconnect();
