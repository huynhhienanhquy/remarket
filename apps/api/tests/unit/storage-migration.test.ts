import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(), readFile: vi.fn(), exists: vi.fn(), put: vi.fn(), render: vi.fn(),
}));
vi.mock("../../src/utils/prisma.js", () => ({ prisma: { storageObject: { findUnique: mocks.findUnique } } }));
vi.mock("node:fs/promises", () => ({ readFile: mocks.readFile }));
vi.mock("../../src/services/image-variants.js", () => ({ renderImageVariant: mocks.render }));
vi.mock("../../src/services/storage.js", () => ({
  getLegacyLocalStoragePath: (path: string) => `/legacy/${path}`,
  hasSupabaseStorageObject: mocks.exists, putStorageObject: mocks.put,
  imageVariantPath: (path: string, variant: string) => variant === "original" ? path : `${path}.${variant}.webp`,
}));
import { syncSupabaseImage } from "../../src/services/storage-migration.js";

const path = "users/test/product/image.png";
const original = { contents: Buffer.from("original"), mimeType: "image/png" };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.findUnique.mockResolvedValue(null);
  mocks.readFile.mockRejectedValue(Object.assign(new Error("missing"), { code: "ENOENT" }));
  mocks.exists.mockResolvedValue(false);
  mocks.render.mockResolvedValue(Buffer.from("webp"));
});

describe("Supabase migration", () => {
  it("copies database originals and generates missing derivatives without changing source rows", async () => {
    mocks.findUnique.mockImplementation(async ({ where }: { where: { storagePath: string } }) => where.storagePath === path ? original : null);
    expect(await syncSupabaseImage(path)).toBe("available");
    expect(mocks.put.mock.calls.map(([target]) => target)).toEqual([path, `${path}.card.webp`, `${path}.detail.webp`]);
    expect(mocks.put).toHaveBeenCalledWith(path, original.contents, "image/png");
    expect(mocks.render).toHaveBeenCalledTimes(2);
  });
  it("uses local bytes when the database has no copy", async () => {
    mocks.readFile.mockResolvedValue(Buffer.from("local"));
    expect(await syncSupabaseImage(path)).toBe("available");
    expect(mocks.put).toHaveBeenCalledWith(path, Buffer.from("local"), "image/png");
  });
  it("skips existing bucket objects without reading source bytes", async () => {
    mocks.exists.mockResolvedValue(true);
    expect(await syncSupabaseImage(path)).toBe("available");
    expect(mocks.findUnique).not.toHaveBeenCalled();
    expect(mocks.readFile).not.toHaveBeenCalled();
    expect(mocks.put).not.toHaveBeenCalled();
  });
  it("reports missing originals without uploading derivatives", async () => {
    expect(await syncSupabaseImage(path)).toBe("missing");
    expect(mocks.put).not.toHaveBeenCalled();
  });
  it("retains existing derivatives and only fills gaps during dry run", async () => {
    mocks.exists.mockImplementation(async (target: string) => target.endsWith(".card.webp"));
    mocks.findUnique.mockResolvedValue(original);
    expect(await syncSupabaseImage(path, true)).toBe("available");
    expect(mocks.put).not.toHaveBeenCalled();
  });
  it("accepts another sync winning an upload race but propagates actual failures", async () => {
    mocks.findUnique.mockResolvedValue(original);
    mocks.put.mockRejectedValue(new Error("upload failed"));
    await expect(syncSupabaseImage(path)).rejects.toThrow("upload failed");
    mocks.exists.mockReset().mockResolvedValue(true).mockResolvedValueOnce(false);
    expect(await syncSupabaseImage(path)).toBe("available");
  });
  it("propagates provider auth errors before reading or uploading data", async () => {
    mocks.exists.mockRejectedValue(new Error("HTTP 401"));
    await expect(syncSupabaseImage(path)).rejects.toThrow("HTTP 401");
    expect(mocks.findUnique).not.toHaveBeenCalled();
    expect(mocks.put).not.toHaveBeenCalled();
  });
});
