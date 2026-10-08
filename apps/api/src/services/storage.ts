import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "../config/env.js";

const LOCAL_UPLOAD_ROOT = fileURLToPath(new URL("../../uploads/", import.meta.url));
const resourceKey = createHash("sha256").update(`image-resource:${env.jwtSecret}`).digest();
const resourceTokens = new Map<string, { token: string; expiresAt: number }>();

function encodeStorageResource(storagePath: string, expiresAt: number): string {
  const key = `${storagePath}:${expiresAt}`;
  const cached = resourceTokens.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.token;
  for (const [oldKey, old] of resourceTokens) if (old.expiresAt <= Date.now()) resourceTokens.delete(oldKey);
  if (resourceTokens.size >= 1000) resourceTokens.delete(resourceTokens.keys().next().value!);
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", resourceKey, nonce);
  const encrypted = Buffer.concat([cipher.update(storagePath, "utf8"), cipher.final()]);
  const token = Buffer.concat([nonce, cipher.getAuthTag(), encrypted]).toString("base64url");
  resourceTokens.set(key, { token, expiresAt: expiresAt * 1000 });
  return token;
}

/** Opaque URL tokens keep private bucket/storage keys out of public DTOs. */
export function decodeStorageResource(value: unknown): string | null {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{40,2000}$/.test(value)) return null;
  try {
    const data = Buffer.from(value, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", resourceKey, data.subarray(0, 12));
    decipher.setAuthTag(data.subarray(12, 28));
    return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString("utf8");
  } catch { return null; }
}

function storageReadSignature(storagePath: string, expiresAt: number, visibility: "private" | "public" = "private"): string {
  return createHmac("sha256", env.jwtSecret)
    .update(`${normalizedStoragePath(storagePath)}\n${expiresAt}${visibility === "public" ? "\npublic" : ""}`)
    .digest("base64url");
}

/**
 * Browser-safe URL for a private image. An <img> element cannot attach the
 * in-memory Bearer token, so owner previews use a short-lived signature bound
 * to the exact storage object instead.
 */
export function createPrivateStorageUrl(storagePath: string, now = Date.now()): string {
  return createImageStorageUrl(storagePath, "private", now);
}

/** Public image capabilities are minted only after the resource's visibility check. */
export function createPublicStorageUrl(storagePath: string, now = Date.now()): string {
  return createImageStorageUrl(storagePath, "public", now);
}

function createImageStorageUrl(storagePath: string, visibility: "private" | "public", now: number): string {
  const normalized = normalizedStoragePath(storagePath);
  const filename = normalized.split("/").at(-1);
  if (!filename) throw new Error("Invalid storage path.");
  // Stable within a minute for cache reuse; never extend beyond the preview TTL.
  const expiresAt = Math.floor(now / 60_000) * 60 + env.storage.signedUrlTtlSeconds;
  const signature = storageReadSignature(normalized, expiresAt, visibility);
  const query = new URLSearchParams({ expires: String(expiresAt), signature, resource: encodeStorageResource(normalized, expiresAt) });
  if (visibility === "public") query.set("visibility", "public");
  return `/api/v1/uploads/${encodeURIComponent(filename)}?${query.toString()}`;
}

export function verifyPrivateStorageUrl(
  storagePath: string,
  expiresValue: unknown,
  signatureValue: unknown,
  now = Date.now(),
): boolean {
  return verifyImageStorageUrl(storagePath, expiresValue, signatureValue, "private", now);
}

export function verifyImageStorageUrl(
  storagePath: string, expiresValue: unknown, signatureValue: unknown,
  visibility: "private" | "public", now = Date.now(),
): boolean {
  if (typeof expiresValue !== "string" || typeof signatureValue !== "string") return false;
  if (!/^\d{10}$/.test(expiresValue) || !/^[A-Za-z0-9_-]{43}$/.test(signatureValue)) return false;

  const expiresAt = Number(expiresValue);
  const nowSeconds = Math.floor(now / 1000);
  if (
    !Number.isSafeInteger(expiresAt) ||
    expiresAt <= nowSeconds ||
    expiresAt > nowSeconds + env.storage.signedUrlTtlSeconds + 30
  ) {
    return false;
  }

  const expected = storageReadSignature(storagePath, expiresAt, visibility);
  return timingSafeEqual(Buffer.from(signatureValue), Buffer.from(expected));
}

function normalizedStoragePath(storagePath: string): string {
  const normalized = storagePath.replace(/\\/g, "/").replace(/^\/+/, "");
  const segments = normalized.split("/");
  if (
    normalized === "" ||
    segments.some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    throw new Error("Invalid storage path.");
  }
  return normalized;
}

function encodedPath(storagePath: string): string {
  return normalizedStoragePath(storagePath)
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function localAbsolutePath(storagePath: string): string {
  const normalized = normalizedStoragePath(storagePath);
  const relative = normalized.replace(/^users\//, "");
  if (relative === normalized) throw new Error("Storage path is outside the user namespace.");
  const root = path.resolve(LOCAL_UPLOAD_ROOT);
  const target = path.resolve(root, ...relative.split("/"));
  if (!target.startsWith(root + path.sep)) throw new Error("Storage path escapes the upload root.");
  return target;
}

function supabaseHeaders(contentType?: string): Record<string, string> {
  const key = env.storage.supabaseServiceRoleKey;
  if (!key) throw new Error("Supabase Storage is not configured.");
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    ...(contentType ? { "Content-Type": contentType } : {}),
  };
}

function supabaseObjectUrl(storagePath: string): string {
  const base = env.storage.supabaseUrl;
  if (!base) throw new Error("Supabase Storage is not configured.");
  return `${base}/storage/v1/object/${encodeURIComponent(env.storage.bucket)}/${encodedPath(storagePath)}`;
}

function supabaseSignedUrlEndpoint(storagePath: string): string {
  const base = env.storage.supabaseUrl;
  if (!base) throw new Error("Supabase Storage is not configured.");
  return `${base}/storage/v1/object/sign/${encodeURIComponent(env.storage.bucket)}/${encodedPath(storagePath)}`;
}

async function assertStorageResponse(response: Response, operation: string): Promise<void> {
  if (response.ok) return;
  // Do not include request headers or credentials in the error. The response
  // body is intentionally omitted because providers may echo object metadata.
  throw new Error(`Storage ${operation} failed with HTTP ${response.status}.`);
}

export async function putStorageObject(
  storagePath: string,
  contents: Buffer,
  contentType: string,
): Promise<void> {
  if (env.storage.driver === "local") {
    const target = localAbsolutePath(storagePath);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, contents, { flag: "wx" });
    return;
  }

  const response = await fetch(supabaseObjectUrl(storagePath), {
    method: "POST",
    headers: {
      ...supabaseHeaders(contentType),
      "cache-control": `max-age=${env.storage.signedUrlTtlSeconds}`,
      "x-upsert": "false",
    },
    body: contents,
    signal: AbortSignal.timeout(15_000),
  });
  await assertStorageResponse(response, "upload");
}

export async function deleteStorageObject(storagePath: string): Promise<void> {
  const paths = [storagePath, imageVariantPath(storagePath, "card"), imageVariantPath(storagePath, "detail")];
  if (env.storage.driver === "local") {
    await Promise.all(paths.map(async (objectPath) => {
      try { await unlink(localAbsolutePath(objectPath)); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    }));
    return;
  }

  const base = env.storage.supabaseUrl;
  if (!base) throw new Error("Supabase Storage is not configured.");
  const response = await fetch(
    `${base}/storage/v1/object/${encodeURIComponent(env.storage.bucket)}`,
    {
      method: "DELETE",
      headers: supabaseHeaders("application/json"),
      body: JSON.stringify({ prefixes: paths.map(normalizedStoragePath) }),
      signal: AbortSignal.timeout(15_000),
    },
  );
  await assertStorageResponse(response, "delete");
}

const signedReads = new Map<string, { expiresAt: number; promise: Promise<string> }>();

/** Reuse a provider capability only for the same path/deadline; never extend grants. */
export async function createStorageReadUrl(storagePath: string, ttlSeconds = env.storage.signedUrlTtlSeconds): Promise<string | null> {
  if (env.storage.driver === "local") return null;
  const ttl = Math.max(1, Math.min(ttlSeconds, env.storage.signedUrlTtlSeconds));
  const expiresAt = Math.floor(Date.now() / 1000) + ttl;
  const key = `${normalizedStoragePath(storagePath)}:${expiresAt}`;
  const cached = signedReads.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.promise;
  for (const [oldKey, old] of signedReads) if (old.expiresAt <= Date.now()) signedReads.delete(oldKey);
  if (signedReads.size >= 1000) signedReads.delete(signedReads.keys().next().value!);
  const promise = signProviderRead(storagePath, ttl);
  signedReads.set(key, { expiresAt: expiresAt * 1000, promise });
  try { return await promise; } catch (error) { signedReads.delete(key); throw error; }
}

async function signProviderRead(storagePath: string, ttlSeconds: number): Promise<string> {
  const response = await fetch(supabaseSignedUrlEndpoint(storagePath), {
    method: "POST",
    headers: supabaseHeaders("application/json"),
    body: JSON.stringify({ expiresIn: ttlSeconds }),
    signal: AbortSignal.timeout(10_000),
  });
  await assertStorageResponse(response, "signed URL");
  const data = await response.json() as { signedURL?: unknown };
  if (typeof data.signedURL !== "string" || data.signedURL === "") {
    throw new Error("Storage signed URL response is invalid.");
  }
  const base = env.storage.supabaseUrl;
  if (!base) throw new Error("Supabase Storage is not configured.");
  if (/^https?:\/\//i.test(data.signedURL)) return data.signedURL;
  return `${base}/storage/v1${data.signedURL.startsWith("/") ? "" : "/"}${data.signedURL}`;
}

export function getLocalStoragePath(storagePath: string): string {
  if (env.storage.driver !== "local") throw new Error("Local storage is not active.");
  return localAbsolutePath(storagePath);
}

export type ImageVariant = "original" | "card" | "detail";
export function imageVariantPath(storagePath: string, variant: ImageVariant): string {
  return variant === "original" ? storagePath : `${storagePath}.${variant}.webp`;
}

/** Legacy Supabase objects may not have derivatives yet: fall back to the original. */
export async function createStorageImageReadUrl(storagePath: string, variant: ImageVariant, ttlSeconds: number): Promise<string | null> {
  if (variant === "original" || env.storage.driver === "local") return createStorageReadUrl(storagePath, ttlSeconds);
  try { return await createStorageReadUrl(imageVariantPath(storagePath, variant), ttlSeconds); }
  catch { return createStorageReadUrl(storagePath, ttlSeconds); }
}
