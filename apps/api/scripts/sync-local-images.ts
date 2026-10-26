import "dotenv/config";
import { env } from "../src/config/env.js";
import { prisma } from "../src/utils/prisma.js";
import { renderImageVariant } from "../src/services/image-variants.js";
import { assertPrivateSupabaseBucket, imageVariantPath, readDatabaseStorageObject } from "../src/services/storage.js";
import { syncSupabaseImage } from "../src/services/storage-migration.js";

// Run on each machine that still holds legacy uploads. Missing files on this
// machine are reported, never deleted from asset metadata or replaced.
async function sync(): Promise<void> {
  if (env.storage.driver === "local") throw new Error("Set STORAGE_DRIVER=supabase before syncing images.");
  const dryRun = process.argv.includes("--dry-run");
  if (dryRun && env.storage.driver !== "supabase") throw new Error("--dry-run requires STORAGE_DRIVER=supabase.");
  if (env.storage.driver === "supabase") await assertPrivateSupabaseBucket();
  let cursor: string | undefined;
  let shared = 0, missing = 0, failed = 0, processed = 0;
  while (true) {
    const assets = await prisma.uploadAsset.findMany({
      select: { id: true, storagePath: true }, orderBy: { id: "asc" }, take: 100,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (assets.length === 0) break;
    for (const asset of assets) {
      try {
        if (env.storage.driver === "supabase") {
          const result = await syncSupabaseImage(asset.storagePath, dryRun);
          if (result === "missing") {
            missing += 1;
            console.warn(`Missing source bytes for upload asset ${asset.id}. Metadata retained.`);
          }
          else shared += 1;
          continue;
        }
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
      } catch (error) {
        failed += 1;
        const reason = error instanceof Error
          ? /^Storage .+ failed with HTTP \d+\.$/.test(error.message) ? error.message : error.name
          : "Unknown error";
        console.error(`Failed to sync upload asset ${asset.id}: ${reason} Source bytes retained.`);
      } finally {
        processed += 1;
        if (processed % 10 === 0) console.log(`Checked ${processed} assets: ${shared} available, ${missing} missing, ${failed} failed.`);
      }
    }
    cursor = assets.at(-1)!.id;
  }
  console.log(`${dryRun ? "Dry run: images available or ready to copy" : "Images available in shared storage"}: ${shared}. Missing on this machine: ${missing}. Failed: ${failed}.`);
  if (missing) console.log("Run storage:sync on the other upload machines to recover their remaining local images.");
  if (failed || missing) process.exitCode = 1;
}

try { await sync(); }
catch (error) {
  console.error(error instanceof Error ? error.message : "Image sync failed.");
  process.exitCode = 1;
} finally { await prisma.$disconnect(); }
