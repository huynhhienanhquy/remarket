import "dotenv/config";
import { env } from "../src/config/env.js";
import { prisma } from "../src/utils/prisma.js";
import { renderImageVariant } from "../src/services/image-variants.js";
import { imageVariantPath, readDatabaseStorageObject } from "../src/services/storage.js";

// Run on each machine that still holds legacy uploads. Missing files on this
// machine are reported, never deleted from asset metadata or replaced.
async function sync(): Promise<void> {
  if (env.storage.driver !== "database") throw new Error("Set STORAGE_DRIVER=database before syncing local images.");
  let cursor: string | undefined;
  let shared = 0, missing = 0, failed = 0;
  while (true) {
    const assets = await prisma.uploadAsset.findMany({
      select: { id: true, storagePath: true }, orderBy: { id: "asc" }, take: 100,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (assets.length === 0) break;
    for (const asset of assets) {
      try {
        const image = await readDatabaseStorageObject(asset.storagePath);
        if (!image) { missing += 1; continue; }
        // Insert only missing derivatives; shared bytes are never overwritten.
        const variants = await Promise.all((["card", "detail"] as const).map(async (variant) => ({
          variant, image: await readDatabaseStorageObject(imageVariantPath(asset.storagePath, variant)),
        })));
        if (variants.some((entry) => !entry.image)) {
          // Generate into absent paths only, using createMany with duplicate
          // skipping for concurrent syncs on different machines.
          for (const { variant, image: derivative } of variants) {
            if (derivative) continue;
            const contents = await renderImageVariant(image.contents, variant);
            await prisma.storageObject.createMany({ data: [{
              storagePath: imageVariantPath(asset.storagePath, variant), contents, mimeType: "image/webp",
            }], skipDuplicates: true });
          }
        }
        shared += 1;
      } catch {
        failed += 1;
        console.error(`Failed to sync upload asset ${asset.id}. Local file retained.`);
      }
    }
    cursor = assets.at(-1)!.id;
  }
  console.log(`Images available in shared storage: ${shared}. Missing on this machine: ${missing}. Failed: ${failed}.`);
  if (missing) console.log("Run storage:sync on the other upload machines to recover their remaining local images.");
  if (failed) process.exitCode = 1;
}

try { await sync(); }
catch (error) {
  console.error(error instanceof Error ? error.message : "Image sync failed.");
  process.exitCode = 1;
} finally { await prisma.$disconnect(); }
