import { randomUUID } from "node:crypto";
import request from "supertest";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
const client = vi.hoisted(() => ({ uploadAsset: { findFirst: vi.fn() }, session: { findUnique: vi.fn() } }));
vi.mock("../../src/utils/prisma.js", () => ({ prisma: client }));
import { createApp } from "../../src/app.js";
import { createPrivateStorageUrl, createPublicStorageUrl, deleteStorageObject, putStorageObject } from "../../src/services/storage.js";

const app = createApp();
const storagePath = `users/${randomUUID()}/product/${randomUUID()}.png`;
beforeAll(async () => {
  const image = await sharp({ create: { width: 2000, height: 1200, channels: 3, background: "#527bc2" } }).png().toBuffer();
  await putStorageObject(storagePath, image, "image/png");
});
afterAll(() => deleteStorageObject(storagePath));
beforeEach(() => vi.resetAllMocks());
describe("bounded signed image reads", () => {
  it("serves a private preview without DB metadata/session reads", async () => {
    const response = await request(app).get(createPrivateStorageUrl(storagePath)).set("Authorization", "Bearer invalid").expect(200);
    expect(response.headers["content-type"]).toContain("image/png");
    expect(response.headers["cache-control"]).toMatch(/^private, max-age=\d+/);
    expect(client.uploadAsset.findFirst).not.toHaveBeenCalled();
    expect(client.session.findUnique).not.toHaveBeenCalled();
  });
  it("serves a cacheable 480px WebP public derivative and reuses it", async () => {
    const url = `${createPublicStorageUrl(storagePath)}&variant=card`;
    const responses = await Promise.all([request(app).get(url).expect(200), request(app).get(url).expect(200)]);
    expect(responses[0]!.headers["cache-control"]).toMatch(/^public, max-age=\d+, s-maxage=\d+, immutable$/);
    const metadata = await sharp(responses[0]!.body).metadata();
    expect(metadata).toMatchObject({ format: "webp", width: 480, height: 288 });
    expect(client.uploadAsset.findFirst).not.toHaveBeenCalled();
  });
  it("rejects expiry, altered objects and attempts to upgrade private cache visibility", async () => {
    const url = new URL(createPrivateStorageUrl(storagePath), "http://api.test");
    await request(app).get(`${url.pathname}${url.search}&visibility=public`).expect(404);
    await request(app).get(`${url.pathname.replace(/[^/]+$/, "other.png")}${url.search}`).expect(404);
    url.searchParams.set("expires", "1000000000");
    await request(app).get(`${url.pathname}${url.search}`).expect(404);
    expect(client.uploadAsset.findFirst).not.toHaveBeenCalled();
  });
  it("keeps unsigned legacy images behind the database visibility policy", async () => {
    client.uploadAsset.findFirst.mockResolvedValue(null);
    await request(app).get(`/api/v1/uploads/${storagePath.split("/").at(-1)}`).expect(404);
    expect(client.uploadAsset.findFirst).toHaveBeenCalledOnce();
  });
});
