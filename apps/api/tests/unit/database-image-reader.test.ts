import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DatabaseImageReader, type DatabaseImageRead, type DatabaseImageRow } from "../../src/services/database-image-reader.js";

const read = (path: string): DatabaseImageRead => ({ path, fallback: `${path}-original` });
const row = ({ path }: DatabaseImageRead): DatabaseImageRow => ({ requestedPath: path, storagePath: path, contents: Buffer.from(path), mimeType: "image/webp" });
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("bounded database image batching", () => {
  it("combines neighboring reads and maps unordered/missing rows to the correct caller", async () => {
    const load = vi.fn(async (reads: DatabaseImageRead[]) => reads.filter((entry) => entry.path !== "missing").map(row).reverse());
    const reader = new DatabaseImageReader(load);
    const pending = Promise.all([reader.read(read("a")), reader.read(read("missing")), reader.read(read("b"))]);
    await vi.advanceTimersByTimeAsync(5);
    expect(await pending).toEqual([row(read("a")), null, row(read("b"))]);
    expect(load).toHaveBeenCalledOnce();
  });

  it("limits batch size and runs only one image query at a time", async () => {
    let active = 0, peak = 0;
    const load = vi.fn(async (reads: DatabaseImageRead[]) => {
      active += 1; peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 10));
      active -= 1;
      return reads.map(row);
    });
    const reader = new DatabaseImageReader(load, 2);
    const pending = Promise.all(["a", "b", "c", "d", "e"].map((path) => reader.read(read(path))));
    await vi.advanceTimersByTimeAsync(100);
    expect(await pending).toHaveLength(5);
    expect(load.mock.calls.map(([reads]) => reads.length)).toEqual([2, 2, 1]);
    expect(peak).toBe(1);
  });

  it("rejects a failed batch and continues processing later reads", async () => {
    const load = vi.fn<(reads: DatabaseImageRead[]) => Promise<DatabaseImageRow[]>>()
      .mockRejectedValueOnce(new Error("database unavailable"))
      .mockImplementation(async (reads) => reads.map(row));
    const reader = new DatabaseImageReader(load, 2);
    const pending = Promise.allSettled(["a", "b", "c"].map((path) => reader.read(read(path))));
    await vi.advanceTimersByTimeAsync(20);
    expect((await pending).map((result) => result.status)).toEqual(["rejected", "rejected", "fulfilled"]);
  });

  it("bounds waiting requests and accepts reads again after draining", async () => {
    const reader = new DatabaseImageReader(async (reads) => reads.map(row), 2, 5, 2);
    const pending = Promise.all([reader.read(read("a")), reader.read(read("b"))]);
    await expect(reader.read(read("overflow"))).rejects.toThrow("queue is full");
    await vi.advanceTimersByTimeAsync(5);
    await pending;
    const next = reader.read(read("next"));
    await vi.advanceTimersByTimeAsync(5);
    expect(await next).toEqual(row(read("next")));
  });
});
