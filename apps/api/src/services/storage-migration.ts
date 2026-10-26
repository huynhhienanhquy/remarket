import { readFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "../utils/prisma.js";
import { renderImageVariant } from "./image-variants.js";
import { getLegacyLocalStoragePath, hasSupabaseStorageObject, imageVariantPath, putStorageObject } from "./storage.js";
import type { StorageImage } from "./storage.js";

async function readLegacyImage(storagePath: string): Promise<StorageImage | null> {
  const object = await prisma.storageObject.findUnique({
    where: { storagePath }, select: { contents: true, mimeType: true },
  });
  if (object) return { contents: Buffer.from(object.contents), mimeType: object.mimeType };
  let contents: Buffer;
  try { contents = await readFile(getLegacyLocalStoragePath(storagePath)); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  const extension = path.extname(storagePath).toLowerCase();
  const mimeType = extension === ".webp" ? "image/webp" : extension === ".png" ? "image/png"
    : extension === ".jpg" || extension === ".jpeg" ? "image/jpeg" : null;
  if (!mimeType || contents.length === 0 || contents.length > 5 * 1024 * 1024) throw new Error("Invalid legacy image.");
  return { contents, mimeType };
}

/** Copy without changing paths, metadata or source bytes. Safe to rerun. */
export async function syncSupabaseImage(storagePath: string, dryRun = false): Promise<"available" | "missing"> {
  let original: StorageImage | null | undefined;
  for (const variant of ["original", "card", "detail"] as const) {
    const target = imageVariantPath(storagePath, variant);
    if (await hasSupabaseStorageObject(target)) continue;
    let image = await readLegacyImage(target);
    if (!image && variant !== "original") {
      original ??= await readLegacyImage(storagePath);
      if (original) image = { contents: await renderImageVariant(original.contents, variant), mimeType: "image/webp" };
      // An original already in Supabase remains readable without derivatives.
      else continue;
    }
    if (!image) return "missing";
    if (variant === "original") original = image;
    if (!dryRun) {
      try { await putStorageObject(target, image.contents, image.mimeType); }
      catch (error) {
        // A concurrent sync may have won the create-only upload race.
        if (!await hasSupabaseStorageObject(target)) throw error;
      }
    }
  }
  return "available";
}
