import { randomUUID } from "node:crypto";
import request from "supertest";
import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";

const client = vi.hoisted(() => ({
  storageObject: { findUnique: vi.fn(), createMany: vi.fn() },
  uploadAsset: { findFirst: vi.fn() }, session: { findUnique: vi.fn() },
  $queryRaw: vi.fn(),
}));
vi.mock("../../src/utils/prisma.js", () => ({ prisma: client }));
vi.mock("../../src/config/env.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../src/config/env.js")>();
  return { env: { ...original.env, storage: { ...original.env.storage, driver: "database" } } };
});
import { createApp } from "../../src/app.js";
import { createPrivateStorageUrl, createPublicStorageUrl } from "../../src/services/storage.js";
import { databaseImageCache, invalidateDatabaseImage } from "../../src/services/database-image-cache.js";

const app = createApp();
const storagePath = `users/${randomUUID()}/product/${randomUUID()}.png`;
beforeEach(() => {
  vi.resetAllMocks();
  for (const path of [storagePath, `${storagePath}.card.webp`, `${storagePath}.detail.webp`]) databaseImageCache.invalidate(path);
  invalidateDatabaseImage(storagePath);
});

describe("guarded shared database image reads", () => {
  it("reads image bytes without a session or local copy after checking the signature", async () => {
    const contents = await sharp({ create: { width: 64, height: 32, channels: 3, background: "#527bc2" } }).png().toBuffer();
    client.storageObject.findUnique.mockResolvedValue({ contents, mimeType: "image/png" });
    const response = await request(app).get(createPrivateStorageUrl(storagePath)).expect(200);
    expect(response.body).toEqual(contents);
    expect(response.headers["content-type"]).toContain("image/png");
    expect(response.headers["cache-control"]).toMatch(/^private, max-age=\d+/);
    expect(client.session.findUnique).not.toHaveBeenCalled();
    expect(client.uploadAsset.findFirst).not.toHaveBeenCalled();
  });

  it("serves repeated and simultaneous signed reads with one byte query, but still checks every grant", async () => {
    const contents = await sharp({ create: { width: 64, height: 32, channels: 3, background: "#527bc2" } }).png().toBuffer();
    client.storageObject.findUnique.mockResolvedValue({ contents, mimeType: "image/png" });
    const url = createPrivateStorageUrl(storagePath);
    const responses = await Promise.all([request(app).get(url).expect(200), request(app).get(url).expect(200)]);
    expect(responses[0]!.body).toEqual(contents);
    await request(app).get(url).expect(200);
    expect(client.storageObject.findUnique).toHaveBeenCalledOnce();
    await request(app).get(`${url}&visibility=public`).expect(404);
    const expired = new URL(url, "http://api.test");
    expired.searchParams.set("expires", "1000000000");
    await request(app).get(`${expired.pathname}${expired.search}`).expect(404);
    expect(client.storageObject.findUnique).toHaveBeenCalledOnce();
  });

  it("falls back to the original and its MIME when a derivative is missing", async () => {
    const contents = await sharp({ create: { width: 64, height: 32, channels: 3, background: "#527bc2" } }).png().toBuffer();
    client.$queryRaw.mockResolvedValue([{ requestedPath: `${storagePath}.card.webp`, storagePath, contents, mimeType: "image/png" }]);
    const response = await request(app).get(`${createPublicStorageUrl(storagePath)}&variant=card`).expect(200);
    expect(response.body).toEqual(contents);
    expect(response.headers["content-type"]).toContain("image/png");
    expect(client.$queryRaw).toHaveBeenCalledOnce();
    expect(client.storageObject.findUnique).not.toHaveBeenCalled();
  });

  it("returns 404 when the original and local legacy file are both absent", async () => {
    client.storageObject.findUnique.mockResolvedValue(null);
    const response = await request(app).get(createPrivateStorageUrl(storagePath)).expect(404);
    expect(response.body.error.code).toBe("NOT_FOUND");
  });

  it("rejects forged, expired and unsigned private reads before fetching bytes", async () => {
    const url = new URL(createPrivateStorageUrl(storagePath), "http://api.test");
    await request(app).get(`${url.pathname}${url.search}&visibility=public`).expect(404);
    await request(app).get(`${url.pathname}${url.search}&variant=invalid`).expect(404);
    url.searchParams.set("expires", "1000000000");
    await request(app).get(`${url.pathname}${url.search}`).expect(404);
    client.uploadAsset.findFirst.mockResolvedValue(null);
    await request(app).get(url.pathname).expect(404);
    expect(client.storageObject.findUnique).not.toHaveBeenCalled();
    expect(client.storageObject.createMany).not.toHaveBeenCalled();
    expect(client.$queryRaw).not.toHaveBeenCalled();
  });

  it("batches different authorized cards without mixing their bytes or including forged grants", async () => {
    const paths = [storagePath, storagePath.replace(/\.png$/, "-second.png")];
    paths.forEach(invalidateDatabaseImage);
    client.$queryRaw.mockImplementation(async (_query: TemplateStringsArray, payload: string) => {
      const reads = JSON.parse(payload) as Array<{ path: string; fallback: string }>;
      return reads.map((read) => ({ requestedPath: read.path, storagePath: read.path,
        contents: Buffer.from(read.fallback), mimeType: "image/webp" }));
    });
    const responses = await Promise.all(paths.map((path) => request(app).get(`${createPublicStorageUrl(path)}&variant=card`).expect(200)));
    for (const [index, response] of responses.entries()) expect(response.body).toEqual(Buffer.from(paths[index]!));
    expect(client.$queryRaw).toHaveBeenCalledOnce();
    const url = createPublicStorageUrl(paths[0]!);
    await request(app).get(`${url}&variant=card&signature=forged`).expect(404);
    expect(client.$queryRaw).toHaveBeenCalledOnce();
  });
});
