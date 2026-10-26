import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import request from "supertest";
import sharp from "sharp";
import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("../../src/config/env.js", async (original) => {
  const actual = await original<typeof import("../../src/config/env.js")>();
  return { env: { ...actual.env, storage: { ...actual.env.storage, driver: "database" } } };
});
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/utils/prisma.js";
import { backgroundPrisma } from "../../src/utils/background-prisma.js";
import { disconnectDatabaseClient } from "../../src/utils/database-client.js";
import { deleteStorageObject, getLegacyLocalStoragePath, imageVariantPath, putStorageObject } from "../../src/services/storage.js";

const enabled = Boolean(process.env.TEST_DATABASE_URL);
const seller = randomUUID(), category = randomUUID(), product = randomUUID();
const marker = `image-availability-${product}`;
const storagePath = `users/${seller}/product/${randomUUID()}.png`;
const app = createApp();

describe.skipIf(!enabled)("fresh public image availability on PostgreSQL", () => {
  afterAll(async () => {
    await deleteStorageObject(storagePath);
    await prisma.product.deleteMany({ where: { id: product } });
    await prisma.user.deleteMany({ where: { id: seller } });
    await prisma.category.deleteMany({ where: { id: category } });
    await Promise.all([disconnectDatabaseClient(prisma), disconnectDatabaseClient(backgroundPrisma)]);
  });

  it("shows missing files immediately, restores real bytes, invalidates fallbacks and preserves local backfill", async () => {
    await prisma.user.create({ data: { id: seller, fullName: "Image availability test", email: `${seller}@example.test`, passwordHash: "test-only", emailVerifiedAt: new Date() } });
    await prisma.category.create({ data: { id: category, name: marker, slug: marker } });
    await prisma.product.create({ data: { id: product, sellerId: seller, categoryId: category, title: marker,
      description: "Fixture", price: "100000", condition: "GOOD", provinceCode: "VN-01", deliveryMethod: "MEETUP",
      shippingFee: "0", status: "ACTIVE", publishedAt: new Date(),
      images: { create: { storagePath, url: `/api/v1/uploads/${storagePath.split("/").at(-1)!}`, sortOrder: 0 } },
    } });
    const listing = async () => {
      const response = await request(app).get(`/api/v1/products?q=${marker}`).expect(200);
      expect(response.body.data.items).toHaveLength(1);
      return response.body.data.items[0] as { image_url: string | null };
    };
    expect((await listing()).image_url).toBeNull();
    const original = await sharp({ create: { width: 64, height: 32, channels: 3, background: "#527bc2" } }).png().toBuffer();
    await putStorageObject(storagePath, original, "image/png");
    const url = (await listing()).image_url!;
    expect(url).toContain("signature=");
    const fallback = await request(app).get(`${url}&variant=card`).expect(200);
    expect(fallback.body).toEqual(original);
    expect(fallback.headers["content-type"]).toContain("image/png");
    const card = await sharp(original).webp().toBuffer();
    await putStorageObject(imageVariantPath(storagePath, "card"), card, "image/webp");
    expect((await request(app).get(`${url}&variant=card`).expect(200)).body).toEqual(card);
    await deleteStorageObject(storagePath);
    expect((await listing()).image_url).toBeNull();
    await request(app).get(`${url}&variant=card`).expect(404);

    const local = getLegacyLocalStoragePath(storagePath);
    await mkdir(path.dirname(local), { recursive: true });
    await writeFile(local, original, { flag: "wx" });
    const legacyUrl = (await listing()).image_url!;
    expect(legacyUrl).toContain("signature=");
    expect(await prisma.storageObject.count({ where: { storagePath } })).toBe(0);
    // Clear the brief missing-byte entry as a local import/write would; the
    // public list itself deliberately does not cache or import availability.
    const { invalidateDatabaseImage } = await import("../../src/services/database-image-cache.js");
    invalidateDatabaseImage(storagePath);
    expect((await request(app).get(`${legacyUrl}&variant=card`).expect(200)).body).toEqual(original);
    expect(await prisma.storageObject.count({ where: { storagePath } })).toBe(1);
  }, 120_000);
});
