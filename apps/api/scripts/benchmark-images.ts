import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import sharp from "sharp";

// Own filesystem-only fixture; no application tables, URLs or original images are changed.
process.env.RUN_JOBS = "false";
process.env.STORAGE_DRIVER = "local";
const client = new PrismaClient({ log: [{ level: "query", emit: "event" }] });
let sql = 0;
client.$on("query", () => { sql += 1; });
(globalThis as { prisma?: PrismaClient }).prisma = client;
const { createApp } = await import("../src/app.js");
const { createPublicStorageUrl, deleteStorageObject, putStorageObject } = await import("../src/services/storage.js");
const app = createApp();
const path = `users/${randomUUID()}/product/${randomUUID()}.jpg`;
const pixels = Buffer.alloc(2000 * 1200 * 3);
for (let y = 0; y < 1200; y += 1) for (let x = 0; x < 2000; x += 1) {
  const i = (y * 2000 + x) * 3;
  pixels[i] = (x + Math.sin(y / 13) * 100 + 100) % 256;
  pixels[i + 1] = (y + Math.sin(x / 17) * 100 + 100) % 256;
  pixels[i + 2] = (x + y + Math.sin((x + y) / 7) * 100 + 100) % 256;
}
const image = await sharp(pixels, { raw: { width: 2000, height: 1200, channels: 3 } }).jpeg({ quality: 90 }).toBuffer();
const rows: Array<{ variant: string; bytes: number; ms: number[]; sql_statements: number }> = [];
try {
  await putStorageObject(path, image, "image/jpeg");
  const url = createPublicStorageUrl(path);
  for (const variant of ["original", "card", "detail"] as const) {
    const before = sql;
    const ms: number[] = [];
    let bytes = 0;
    for (let i = 0; i < 3; i += 1) {
      const start = performance.now();
      const response = await request(app).get(`${url}&variant=${variant}`).expect(200);
      ms.push(Math.round(performance.now() - start));
      bytes = response.body.length;
    }
    assert.equal(sql - before, 0, "Signed image reads must not query the database");
    rows.push({ variant, bytes, ms, sql_statements: sql - before });
  }
  console.log(JSON.stringify({ fixture: "generated 2000x1200 JPEG", measurements: rows }));
  const dir = fileURLToPath(new URL("../../../.artifacts/performance/", import.meta.url));
  await mkdir(dir, { recursive: true });
  await writeFile(`${dir}images-code-final.json`, JSON.stringify({ fixture: "generated 2000x1200 JPEG; end-to-end local HTTP, not remote Storage", measurements: rows }, null, 2));
} finally {
  await deleteStorageObject(path);
  await client.$disconnect();
}
