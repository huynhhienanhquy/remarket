import { describe, expect, it } from "vitest";
import { detectImageType } from "../../src/routes/uploads.js";
import { newRefreshToken, sha256, signAccessToken, verifyAccessToken } from "../../src/shared/tokens.js";
import { sealEmailToken } from "../../src/services/email.js";
import { normalizeRateLimitIp } from "../../src/middleware/rate-limit.js";
import jwt from "jsonwebtoken";
import { env } from "../../src/config/env.js";

describe("security primitives", () => {
  it("uses opaque 256-bit refresh tokens and hashes them", () => {
    const token = newRefreshToken();
    expect(Buffer.from(token, "base64url")).toHaveLength(32);
    expect(sha256(token)).toMatch(/^[a-f0-9]{64}$/);
    expect(newRefreshToken()).not.toBe(token);
  });

  it("round-trips the minimal access-token identity", () => {
    const token = signAccessToken("user-id", "session-id");
    expect(verifyAccessToken(token)).toMatchObject({ userId: "user-id", sessionId: "session-id" });
    expect(verifyAccessToken(token)?.expiresAt).toBeGreaterThan(Date.now());
  });
  it.each([
    { sub: "", session_id: "session" },
    { sub: "user", session_id: "" },
    { sub: "user", session_id: "session", iat: Math.floor(Date.now() / 1000) + 60 },
  ])("rejects incomplete identity or future-issued JWT claims", (claims) => {
    const token = jwt.sign(claims, env.jwtSecret, { issuer: env.jwtIssuer, audience: env.jwtAudience, expiresIn: "15m", algorithm: env.jwtAlgorithm });
    expect(verifyAccessToken(token)).toBeNull();
  });
  it.each([{ issuer: "wrong" }, { audience: "wrong" }, { expiresIn: -1 }])("rejects wrong issuer/audience and expired JWT", (override) => {
    const token = jwt.sign({ sub: "user", session_id: "session" }, env.jwtSecret, { issuer: env.jwtIssuer, audience: env.jwtAudience, expiresIn: "15m", ...override });
    expect(verifyAccessToken(token)).toBeNull();
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
