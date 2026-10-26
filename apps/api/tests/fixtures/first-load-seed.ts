import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import sharp from "sharp";
import { prisma } from "../../src/utils/prisma.js";
import { disconnectDatabaseClient } from "../../src/utils/database-client.js";

const url = process.env.TEST_DATABASE_URL;
assert.ok(url && url === process.env.DATABASE_URL);
const schema = new URL(url).searchParams.get("schema");
assert.match(schema ?? "", /^remarket_verify_[a-f0-9]{32}$/);
assert.ok(process.env.TEST_ACCOUNT_PASSWORD);
try {
  const [current] = await prisma.$queryRaw<Array<{ name: string }>>`SELECT current_schema()::text AS name`;
  assert.equal(current?.name, schema);
  const user = randomUUID(), category = randomUUID();
  await prisma.user.create({ data: { id: user, email: "buyer@example.test", fullName: "First load test",
    passwordHash: await bcrypt.hash(process.env.TEST_ACCOUNT_PASSWORD, 10), emailVerifiedAt: new Date() } });
  await prisma.category.create({ data: { id: category, name: "First load test", slug: category } });
  const products = Array.from({ length: 4 }, () => ({ id: randomUUID(), sellerId: user, categoryId: category,
    title: "First load product", description: "Isolated fixture", price: "100000", condition: "GOOD" as const,
    provinceCode: "VN-01", deliveryMethod: "MEETUP" as const, shippingFee: "0", status: "ACTIVE" as const, publishedAt: new Date() }));
  await prisma.product.createMany({ data: products });
  const contents = await sharp({ create: { width: 480, height: 360, channels: 3, background: "#527bc2" } }).webp().toBuffer();
  const images = products.map((product) => ({ productId: product.id, sortOrder: 0,
    url: `/api/v1/uploads/${product.id}.webp`, storagePath: `users/${user}/product/${product.id}.webp` }));
  await prisma.storageObject.createMany({ data: images.flatMap((image) => [image.storagePath, `${image.storagePath}.card.webp`]
    .map((storagePath) => ({ storagePath, contents, mimeType: "image/webp" }))) });
  await prisma.productImage.createMany({ data: images });
  console.log("Created isolated member and four real product images for first-load verification");
} finally { await disconnectDatabaseClient(prisma); }
