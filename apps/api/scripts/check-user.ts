import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const user = await p.user.findUnique({ where: { email: 'anh.mua@remarket.vn' } });
console.log('User:', JSON.stringify({ id: user?.id, email: user?.email, emailVerifiedAt: user?.emailVerifiedAt, status: user?.status }, null, 2));
await p.$disconnect();