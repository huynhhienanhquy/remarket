/** Coalesce neighboring HTTP image reads into bounded batches. Only one image
 * query runs at a time so images do not occupy the whole shared HTTP DB pool. */
export interface DatabaseImageRead { path: string; fallback: string | null }
export interface DatabaseImageRow {
  requestedPath: string;
  storagePath: string;
  contents: Uint8Array;
  mimeType: string;
}
type PendingRead = {
  request: DatabaseImageRead;
  resolve: (image: DatabaseImageRow | null) => void;
  reject: (error: unknown) => void;
};

export class DatabaseImageReader {
  private readonly queue: PendingRead[] = [];
  private active = false;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly load: (requests: DatabaseImageRead[]) => Promise<DatabaseImageRow[]>,
    private readonly batchSize = 4,
    private readonly delayMs = 5,
    private readonly maxQueued = 128,
  ) {}

  read(request: DatabaseImageRead): Promise<DatabaseImageRow | null> {
    if (this.queue.length >= this.maxQueued) return Promise.reject(new Error("Image read queue is full"));
    return new Promise((resolve, reject) => {
      this.queue.push({ request, resolve, reject });
      this.schedule();
    });
  }

  private schedule(): void {
    if (this.active || this.timer || this.queue.length === 0) return;
    this.timer = setTimeout(() => { this.timer = undefined; void this.flush(); }, this.delayMs);
  }

  private async flush(): Promise<void> {
    this.active = true;
    const batch = this.queue.splice(0, this.batchSize);
    try {
      const rows = await this.load(batch.map((entry) => entry.request));
      const byPath = new Map(rows.map((row) => [row.requestedPath, row]));
      for (const entry of batch) entry.resolve(byPath.get(entry.request.path) ?? null);
    } catch (error) {
      for (const entry of batch) entry.reject(error);
    } finally {
      this.active = false;
      this.schedule();
    }
  }
}

export const databaseImageReader = new DatabaseImageReader(async (requests) => {
  const { prisma } = await import("../utils/prisma.js");
  // One constant query shape regardless of batch size. LATERAL chooses one
  // object per image, avoiding transfer of large originals when a card exists.
  return prisma.$queryRaw<DatabaseImageRow[]>`
    SELECT r.path AS "requestedPath", image."storagePath", image.contents, image."mimeType"
    FROM jsonb_to_recordset(${JSON.stringify(requests)}::jsonb) AS r(path text, fallback text)
    CROSS JOIN LATERAL (
      SELECT s."storagePath", s.contents, s."mimeType" FROM "StorageObject" s
      WHERE s."storagePath" = r.path OR s."storagePath" = r.fallback
      ORDER BY (s."storagePath" = r.path) DESC LIMIT 1
    ) image`;
});
