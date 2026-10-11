import { Prisma } from "@prisma/client";
import { validationError } from "../shared/errors.js";

export async function lockEligibleUploads(
  tx: Prisma.TransactionClient,
  userId: string,
  productId: string,
  images: readonly { storagePath: string }[],
): Promise<string[]> {
  const paths = images.map((image) => image.storagePath);
  if (new Set(paths).size !== paths.length) {
    throw validationError("Ảnh bị trùng lặp.", { images: "Mỗi ảnh chỉ được dùng một lần." });
  }
  const sortedPaths = [...paths].sort();
  await tx.$queryRaw(
    Prisma.sql`SELECT "id" FROM "UploadAsset" WHERE "storagePath" IN (${Prisma.join(sortedPaths)}) ORDER BY "storagePath" FOR UPDATE`,
  );
  const assets = await tx.uploadAsset.findMany({ where: { storagePath: { in: paths } } });
  const byPath = new Map(assets.map((asset) => [asset.storagePath, asset]));
  for (const storagePath of paths) {
    const asset = byPath.get(storagePath);
    if (
      !asset ||
      asset.userId !== userId ||
      asset.purpose !== "product" ||
      (asset.attachedAt !== null && asset.productId !== productId)
    ) {
      throw validationError("Ảnh không thuộc tin đăng này.", {
        images: "Hãy tải lại ảnh bằng chính tài khoản đang đăng tin.",
      });
    }
  }
  return assets.map((asset) => asset.id);
}

export async function claimUploads(tx: Prisma.TransactionClient, userId: string, productId: string, images: readonly { storagePath: string }[]): Promise<void> {
  const ids = await lockEligibleUploads(tx, userId, productId, images);
  await tx.uploadAsset.updateMany({
    where: { id: { in: ids } },
    data: { productId, attachedAt: new Date() },
  });
}

export async function detachUnusedUploads(
  tx: Prisma.TransactionClient,
  productId: string,
  storagePaths: string[],
): Promise<void> {
  if (storagePaths.length === 0) return;
  const urlToPath = new Map(
    storagePaths.map((storagePath) => [
      `/api/v1/uploads/${storagePath.split("/").at(-1)}`,
      storagePath,
    ]),
  );
  const snapshots = await tx.orderItem.findMany({
    where: {
      OR: [
        { imagePathSnapshot: { in: storagePaths } },
        { imageUrl: { in: [...urlToPath.keys()] } },
      ],
    },
    select: { imagePathSnapshot: true, imageUrl: true },
  });
  const retained = new Set<string>();
  for (const item of snapshots) {
    if (item.imagePathSnapshot && storagePaths.includes(item.imagePathSnapshot)) {
      retained.add(item.imagePathSnapshot);
    }
    if (item.imageUrl) {
      const path = urlToPath.get(item.imageUrl);
      if (path) retained.add(path);
    }
  }
  const detachable = storagePaths.filter((storagePath) => !retained.has(storagePath));
  if (detachable.length === 0) return;
  await tx.uploadAsset.updateMany({
    where: { productId, storagePath: { in: detachable } },
    data: { productId: null, attachedAt: null },
  });
}
