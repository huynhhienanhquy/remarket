import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "../config/env.js";

const LOCAL_UPLOAD_ROOT = fileURLToPath(new URL("../../uploads/", import.meta.url));

function storageReadSignature(storagePath: string, expiresAt: number): string {
  return createHmac("sha256", env.jwtSecret)
    .update(`${normalizedStoragePath(storagePath)}\n${expiresAt}`)
    .digest("base64url");
}

/**
 * Browser-safe URL for a private image. An <img> element cannot attach the
 * in-memory Bearer token, so owner previews use a short-lived signature bound
 * to the exact storage object instead.
 */
export function createPrivateStorageUrl(storagePath: string, now = Date.now()): string {
  const normalized = normalizedStoragePath(storagePath);
  const filename = normalized.split("/").at(-1);
  if (!filename) throw new Error("Invalid storage path.");
  const expiresAt = Math.floor(now / 1000) + env.storage.signedUrlTtlSeconds;
  const signature = storageReadSignature(normalized, expiresAt);
  const query = new URLSearchParams({ expires: String(expiresAt), signature });
  return `/api/v1/uploads/${encodeURIComponent(filename)}?${query.toString()}`;
}

export function verifyPrivateStorageUrl(
  storagePath: string,
  expiresValue: unknown,
  signatureValue: unknown,
  now = Date.now(),
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

  const expected = storageReadSignature(storagePath, expiresAt);
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
  if (env.storage.driver === "local") {
    try {
      await unlink(localAbsolutePath(storagePath));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    return;
  }

  const base = env.storage.supabaseUrl;
  if (!base) throw new Error("Supabase Storage is not configured.");
  const response = await fetch(
    `${base}/storage/v1/object/${encodeURIComponent(env.storage.bucket)}`,
    {
      method: "DELETE",
      headers: supabaseHeaders("application/json"),
      body: JSON.stringify({ prefixes: [normalizedStoragePath(storagePath)] }),
      signal: AbortSignal.timeout(15_000),
    },
  );
  await assertStorageResponse(response, "delete");
}

/** Returns a five-minute provider URL, or null when local disk streams itself. */
export async function createStorageReadUrl(storagePath: string): Promise<string | null> {
  if (env.storage.driver === "local") return null;
  const response = await fetch(supabaseSignedUrlEndpoint(storagePath), {
    method: "POST",
    headers: supabaseHeaders("application/json"),
    body: JSON.stringify({ expiresIn: env.storage.signedUrlTtlSeconds }),
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
