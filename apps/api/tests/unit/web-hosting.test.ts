import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";

let webRoot: string;
beforeAll(async () => {
  webRoot = await mkdtemp(path.join(tmpdir(), "remarket-web-test-"));
  await mkdir(path.join(webRoot, "assets"));
  await writeFile(path.join(webRoot, "index.html"), '<!doctype html><div id="root">web-test</div>');
  await writeFile(path.join(webRoot, "assets", "app-123.js"), "export const test = true;");
  await writeFile(path.join(webRoot, ".env"), "never-serve-this");
});
afterAll(async () => { await rm(webRoot, { recursive: true, force: true }); });

describe("combined web/API hosting", () => {
  it.each(["/", "/login", "/admin/email-verifications", "/products/some-product"])("serves the SPA at %s without caching HTML", async (route) => {
    const response = await request(createApp({ webRoot })).get(route).set("Accept", "text/html").expect(200);
    expect(response.text).toContain("web-test");
    expect(response.headers["cache-control"]).toBe("no-cache");
    expect(response.headers["content-security-policy"]).toContain("script-src 'self'");
  });
  it("serves versioned assets with immutable caching", async () => {
    const response = await request(createApp({ webRoot })).get("/assets/app-123.js").expect(200);
    expect(response.text).toContain("export const test");
    expect(response.headers["cache-control"]).toContain("immutable");
  });
  it.each(["/api/v1/no-such-route", "/health/unknown", "/socket.io/unknown", "/assets/missing.js"])("keeps %s a JSON 404", async (route) => {
    const response = await request(createApp({ webRoot })).get(route).set("Accept", "text/html").expect(404);
    expect(response.body.error.code).toBe("NOT_FOUND");
  });
  it("keeps the liveness endpoint available", async () => {
    const response = await request(createApp({ webRoot })).get("/health/live").expect(200);
    expect(response.body.live).toBe(true);
  });
  it("never serves dotfile contents or falls back for POST requests", async () => {
    const response = await request(createApp({ webRoot })).get("/.env");
    expect(response.text).not.toContain("never-serve-this");
    await request(createApp({ webRoot })).post("/login").expect(404);
  });
  it("fails startup when the frontend build is absent", () => {
    expect(() => createApp({ webRoot: path.join(webRoot, "missing") })).toThrow("Web build is missing");
  });
});
