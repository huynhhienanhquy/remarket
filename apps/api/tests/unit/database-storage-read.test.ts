import { randomUUID } from "node:crypto";
import request from "supertest";
import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";

const client = vi.hoisted(() => ({
  storageObject: { findUnique: vi.fn(), createMany: vi.fn() },
  uploadAsset: { findFirst: vi.fn() }, session: { findUnique: vi.fn() },
}));
vi.mock("../../src/utils/prisma.js", () => ({ prisma: client }));
vi.mock("../../src/config/env.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../src/config/env.js")>();
  return { env: { ...original.env, storage: { ...original.env.storage, driver: "database" } } };
});
import { createApp } from "../../src/app.js";
import { createPrivateStorageUrl, createPublicStorageUrl } from "../../src/services/storage.js";

const app = createApp();
const storagePath = `users/${randomUUID()}/product/${randomUUID()}.png`;
beforeEach(() => vi.resetAllMocks());

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

  it("falls back to the original and its MIME when a derivative is missing", async () => {
    const contents = await sharp({ create: { width: 64, height: 32, channels: 3, background: "#527bc2" } }).png().toBuffer();
    client.storageObject.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ contents, mimeType: "image/png" });
    const response = await request(app).get(`${createPublicStorageUrl(storagePath)}&variant=card`).expect(200);
    expect(response.body).toEqual(contents);
    expect(response.headers["content-type"]).toContain("image/png");
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
  });
});
