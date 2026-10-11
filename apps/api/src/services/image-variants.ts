import { access, readFile } from "node:fs/promises";
import sharp from "sharp";
import { getLocalStoragePath, imageVariantPath, putStorageObject, readDatabaseStorageObject } from "./storage.js";
import type { ImageVariant, StorageImage } from "./storage.js";

const pending = new Map<string, Promise<string>>();
// Bound decoded-image memory when several old listings request thumbnails at once.
let activeTransforms = 0;
const waiting: Array<() => void> = [];
export async function renderImageVariant(contents: Buffer, variant: "card" | "detail"): Promise<Buffer> {
  if (activeTransforms >= 4) {
    if (waiting.length >= 32) throw new Error("Image transform queue is full");
    await new Promise<void>((resolve) => waiting.push(resolve));
  } else activeTransforms += 1;
  try {
    return await sharp(contents, { limitInputPixels: 20_000_000 }).rotate()
      .resize({ width: variant === "card" ? 480 : 1600, withoutEnlargement: true })
      .webp({ quality: variant === "card" ? 78 : 82 }).toBuffer();
  } finally {
    const next = waiting.shift();
    if (next) next();
    else activeTransforms -= 1;
  }
}

export async function generateImageVariants(storagePath: string, contents: Buffer): Promise<void> {
  const results = await Promise.allSettled((["card", "detail"] as const).map(async (variant) => {
    const data = await renderImageVariant(contents, variant);
    await putStorageObject(imageVariantPath(storagePath, variant), data, "image/webp");
  }));
  const failure = results.find((result) => result.status === "rejected");
  if (failure?.status === "rejected") throw failure.reason;
}

/** Legacy shared images without derivatives remain readable with their real MIME type. */
export async function databaseImageVariant(storagePath: string, variant: ImageVariant): Promise<StorageImage | null> {
  const image = await readDatabaseStorageObject(imageVariantPath(storagePath, variant));
  return image ?? (variant === "original" ? null : readDatabaseStorageObject(storagePath));
}

/** Existing local uploads gain derivatives lazily; never overwrite original bytes. */
export async function localImageVariant(storagePath: string, variant: ImageVariant): Promise<string> {
  const target = getLocalStoragePath(imageVariantPath(storagePath, variant));
  if (variant === "original") return target;
  try { await access(target); return target; } catch { /* derivative not generated yet */ }
  const running = pending.get(target);
  if (running) return running;
  const work = (async () => {
    const contents = await readFile(getLocalStoragePath(storagePath));
    const data = await renderImageVariant(contents, variant);
    try { await putStorageObject(imageVariantPath(storagePath, variant), data, "image/webp"); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
    return target;
  })();
  pending.set(target, work);
  try { return await work; } finally { pending.delete(target); }
}
