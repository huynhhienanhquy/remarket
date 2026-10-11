import { randomUUID } from "node:crypto";
import { access, mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import sharp from "sharp";
import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("../../src/config/env.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../src/config/env.js")>();
  return { env: { ...original.env, storage: { ...original.env.storage, driver: "database" } } };
});
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/utils/prisma.js";
import { backgroundPrisma } from "../../src/utils/background-prisma.js";
import { signAccessToken } from "../../src/shared/tokens.js";
import { createPrivateStorageUrl, deleteStorageObject, getLegacyLocalStoragePath, imageVariantPath, importLocalStorageObject } from "../../src/services/storage.js";

const enabled = Boolean(process.env.TEST_DATABASE_URL);
const sellerId = randomUUID(), categoryId = randomUUID(), productId = randomUUID();
const objects: string[] = [];
// A separate PostgreSQL client proves bytes persist outside the uploader's
// connection; two HTTP applications represent machines with independent APIs.
const otherClient = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL } } });
const uploader = createApp(), viewer = createApp();

describe.skipIf(!enabled)("shared image storage across independent APIs", () => {
  afterAll(async () => {
    for (const object of objects) await deleteStorageObject(object);
    await prisma.product.deleteMany({ where: { id: productId } });
    await prisma.user.deleteMany({ where: { id: sellerId } });
    await prisma.category.deleteMany({ where: { id: categoryId } });
    await Promise.all([prisma.$disconnect(), backgroundPrisma.$disconnect(), otherClient.$disconnect()]);
  });

  it("uploads on API A and serves originals, thumbnails and published images on API B without local files", async () => {
    await prisma.user.create({ data: { id: sellerId, fullName: "Shared image seller", email: `${sellerId}@example.test`, passwordHash: "test-only", emailVerifiedAt: new Date() } });
    const session = await prisma.session.create({ data: { userId: sellerId, expiresAt: new Date(Date.now() + 600_000) } });
    const token = signAccessToken(sellerId, session.id);
    const input = await sharp({ create: { width: 2000, height: 1200, channels: 3, background: "#527bc2" } }).png().toBuffer();
    const upload = await request(uploader).post("/api/v1/uploads").set("Authorization", `Bearer ${token}`)
      .field("purpose", "product").attach("file", input, { filename: "from-another-machine.png", contentType: "image/png" }).expect(201);
    const storagePath: string = upload.body.data.storage_path;
    objects.push(storagePath);
    const stored = await otherClient.storageObject.findUniqueOrThrow({ where: { storagePath } });
    await expect(access(getLegacyLocalStoragePath(storagePath))).rejects.toMatchObject({ code: "ENOENT" });
    const original = await request(viewer).get(upload.body.data.url).expect(200);
    expect(original.body).toEqual(Buffer.from(stored.contents));
    for (const [variant, width] of [["card", 480], ["detail", 1600]] as const) {
      const response = await request(viewer).get(`${upload.body.data.url}&variant=${variant}`).expect(200);
      expect(await sharp(response.body).metadata()).toMatchObject({ format: "webp", width });
      expect(await otherClient.storageObject.count({ where: { storagePath: imageVariantPath(storagePath, variant) } })).toBe(1);
      await expect(access(getLegacyLocalStoragePath(imageVariantPath(storagePath, variant)))).rejects.toMatchObject({ code: "ENOENT" });
    }
    const filename = storagePath.split("/").at(-1)!;
    await request(viewer).get(`/api/v1/uploads/${filename}`).expect(404);
    await prisma.category.create({ data: { id: categoryId, name: "Shared images", slug: randomUUID() } });
    await prisma.product.create({ data: { id: productId, sellerId, categoryId, title: "Image from another machine", description: "Shared storage regression", price: "100000", condition: "GOOD", provinceCode: "VN-01", deliveryMethod: "MEETUP", shippingFee: "0", status: "ACTIVE", publishedAt: new Date(),
      images: { create: { url: `/api/v1/uploads/${filename}`, storagePath, sortOrder: 0 } } } });
    await prisma.uploadAsset.update({ where: { storagePath }, data: { productId, attachedAt: new Date() } });
    const listing = await request(viewer).get(`/api/v1/products/${productId}`).expect(200);
    const publicUrl: string = listing.body.data.images[0].url;
    expect(publicUrl).toContain("visibility=public");
    await request(viewer).get(publicUrl).expect(200);
    await request(viewer).get(`/api/v1/uploads/${filename}`).expect(200);
    await deleteStorageObject(storagePath);
    expect(await otherClient.storageObject.count({ where: { storagePath: { in: [storagePath, imageVariantPath(storagePath, "card"), imageVariantPath(storagePath, "detail")] } } })).toBe(0);
    await request(viewer).get(publicUrl).expect(404);
  });

  it("imports an old local file idempotently without replacing shared bytes or deleting the source", async () => {
    const storagePath = `users/${sellerId}/product/${randomUUID()}.png`;
    objects.push(storagePath);
    const file = getLegacyLocalStoragePath(storagePath);
    const contents = await sharp({ create: { width: 64, height: 32, channels: 3, background: "#527bc2" } }).png().toBuffer();
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, contents, { flag: "wx" });
    try {
      await importLocalStorageObject(storagePath);
      await writeFile(file, await sharp(contents).negate().png().toBuffer());
      await importLocalStorageObject(storagePath);
      expect(Buffer.from((await otherClient.storageObject.findUniqueOrThrow({ where: { storagePath } })).contents)).toEqual(contents);
      await access(file);
      await unlink(file);
      const response = await request(viewer).get(createPrivateStorageUrl(storagePath)).expect(200);
      expect(response.body).toEqual(contents);
    } finally { await unlink(file).catch(() => undefined); }
  });
});
