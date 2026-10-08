import { describe, expect, it } from "vitest";
import { detectImageType } from "../../src/routes/uploads.js";
import { newRefreshToken, sha256, signAccessToken, verifyAccessToken } from "../../src/shared/tokens.js";
import { sealEmailToken } from "../../src/services/email.js";
import { normalizeRateLimitIp } from "../../src/middleware/rate-limit.js";

describe("security primitives", () => {
  it("uses opaque 256-bit refresh tokens and hashes them", () => {
    const token = newRefreshToken();
    expect(Buffer.from(token, "base64url")).toHaveLength(32);
    expect(sha256(token)).toMatch(/^[a-f0-9]{64}$/);
    expect(newRefreshToken()).not.toBe(token);
  });

  it("round-trips the minimal access-token identity", () => {
    const token = signAccessToken("user-id", "session-id");
    expect(verifyAccessToken(token)).toEqual({ userId: "user-id", sessionId: "session-id" });
  });

  it("does not persist a raw email token in an outbox payload", () => {
    const raw = "one-time-secret-token";
    const sealed = sealEmailToken(raw);
    expect(sealed).not.toContain(raw);
    expect(sealed.split(".")).toHaveLength(3);
  });

  it("detects image formats by magic bytes, not extension", () => {
    expect(detectImageType(Buffer.from([0xff, 0xd8, 0xff, 0x00]))).toBe("jpg");
    expect(detectImageType(Buffer.from([0x89, 0x50, 0x4e, 0x47]))).toBe("png");
    expect(detectImageType(Buffer.from("not an image"))).toBeNull();
  });

  it("uses one rate-limit key for addresses in the same IPv6 /64", () => {
    expect(normalizeRateLimitIp("2001:db8:abcd:12::1")).toBe("2001:0db8:abcd:0012::/64");
    expect(normalizeRateLimitIp("2001:db8:abcd:12::ffff")).toBe("2001:0db8:abcd:0012::/64");
    expect(normalizeRateLimitIp("::ffff:192.0.2.10")).toBe("192.0.2.10");
    expect(normalizeRateLimitIp("192.0.2.10")).toBe("192.0.2.10");
  });
});
