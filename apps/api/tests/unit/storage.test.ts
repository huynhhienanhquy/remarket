import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  createPrivateStorageUrl,
  getLocalStoragePath,
  verifyPrivateStorageUrl,
  createPublicStorageUrl,
  verifyImageStorageUrl,
  decodeStorageResource,
} from "../../src/services/storage.js";

describe("private storage paths", () => {
  it("resolves a user object only inside the private upload root", () => {
    const resolved = getLocalStoragePath(
      "users/00000000-0000-0000-0000-000000000001/product/image.webp",
    );
    expect(resolved).toContain(`${path.sep}apps${path.sep}api${path.sep}uploads${path.sep}`);
    expect(resolved).toMatch(/image\.webp$/);
  });

  it.each([
    "image.webp",
    "users/../secret.webp",
    "users/account/../../secret.webp",
    "users//avatar.webp",
    "/../secret.webp",
  ])("rejects an unsafe object path: %s", (storagePath) => {
    expect(() => getLocalStoragePath(storagePath)).toThrow();
  });
});

describe("private storage preview URLs", () => {
  const storagePath = "users/00000000-0000-0000-0000-000000000001/product/image.webp";
  const now = Date.UTC(2026, 9, 7, 5, 0, 0);

  it("creates a time-limited signature bound to the exact object", () => {
    const url = new URL(createPrivateStorageUrl(storagePath, now), "http://api.test");

    expect(url.pathname).toBe("/api/v1/uploads/image.webp");
    expect(url.href).not.toContain("users/");
    expect(decodeStorageResource(url.searchParams.get("resource"))).toBe(storagePath);
    expect(
      verifyPrivateStorageUrl(
        storagePath,
        url.searchParams.get("expires"),
        url.searchParams.get("signature"),
        now,
      ),
    ).toBe(true);
    expect(
      verifyPrivateStorageUrl(
        storagePath.replace("image.webp", "other.webp"),
        url.searchParams.get("expires"),
        url.searchParams.get("signature"),
        now,
      ),
    ).toBe(false);
  });

  it("rejects expired or malformed preview signatures", () => {
    const url = new URL(createPrivateStorageUrl(storagePath, now), "http://api.test");
    const expires = url.searchParams.get("expires");
    const signature = url.searchParams.get("signature");

    expect(verifyPrivateStorageUrl(storagePath, expires, signature, now + 301_000)).toBe(false);
    expect(verifyPrivateStorageUrl(storagePath, expires, "invalid", now)).toBe(false);
  });

  it("cannot turn a private preview into a publicly cacheable grant", () => {
    const privateUrl = new URL(createPrivateStorageUrl(storagePath, now), "http://api.test");
    expect(verifyImageStorageUrl(storagePath, privateUrl.searchParams.get("expires"), privateUrl.searchParams.get("signature"), "public", now)).toBe(false);
    const publicUrl = new URL(createPublicStorageUrl(storagePath, now), "http://api.test");
    expect(verifyImageStorageUrl(storagePath, publicUrl.searchParams.get("expires"), publicUrl.searchParams.get("signature"), "public", now)).toBe(true);
    expect(verifyPrivateStorageUrl(storagePath, publicUrl.searchParams.get("expires"), publicUrl.searchParams.get("signature"), now)).toBe(false);
    const resource = publicUrl.searchParams.get("resource")!;
    expect(decodeStorageResource(`${resource[0] === "A" ? "B" : "A"}${resource.slice(1)}`)).toBeNull();
  });
});
