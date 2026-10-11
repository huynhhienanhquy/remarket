import { RateQuota, chatQuota } from "../services/rate-quota.js";
import type { RequestHandler } from "express";
import { isIP } from "node:net";
import { API_ERROR_CODES } from "@remarket/shared";
import type { AuthRequest } from "./auth.js";
import { envelopeMeta } from "../shared/api-response.js";

type KeyMode = "ip" | "user" | "ip-email";

/**
 * Use one quota for an IPv6 /64 instead of allowing address rotation inside a
 * client subnet to bypass an in-memory limiter. IPv4-mapped IPv6 is folded
 * back to the IPv4 key.
 */
export function normalizeRateLimitIp(input: string | undefined): string {
  const raw = (input ?? "unknown").split("%", 1)[0]?.toLowerCase() ?? "unknown";
  if (raw.startsWith("::ffff:")) {
    const mapped = raw.slice("::ffff:".length);
    if (isIP(mapped) === 4) return mapped;
  }
  const version = isIP(raw);
  if (version !== 6) return raw;

  const halves = raw.split("::");
  if (halves.length > 2) return raw;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  if (missing < 0) return raw;
  const full = [...left, ...Array.from({ length: missing }, () => "0"), ...right];
  if (full.length !== 8) return raw;
  return `${full.slice(0, 4).map((part) => part.padStart(4, "0")).join(":")}::/64`;
}

function limited(windowMs: number, limit: number, keyMode: KeyMode, quota = new RateQuota(windowMs, limit)): RequestHandler {
  return (req, res, next) => {
    const ip = normalizeRateLimitIp(req.ip ?? req.socket.remoteAddress);
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "unknown";
    const key = keyMode === "user" ? (req as AuthRequest).user?.id ?? ip
      : keyMode === "ip-email" ? ip + ":" + email : ip;
    const result = quota.consume(key);
    res.setHeader("RateLimit-Limit", limit);
    res.setHeader("RateLimit-Remaining", result.remaining);
    res.setHeader("RateLimit-Reset", result.retryAfter);
    if (result.allowed) { next(); return; }
    res.setHeader("Retry-After", result.retryAfter);
    res.status(429).json({
      success: false,
      error: { code: API_ERROR_CODES.RATE_LIMITED, message: "Bạn thao tác quá nhanh, vui lòng thử lại sau." },
      meta: envelopeMeta(res),
    });
  };
}

export const loginRateLimit = limited(15 * 60 * 1000, 10, "ip-email");
export const emailTokenRateLimit = limited(60 * 60 * 1000, 3, "ip-email");
export const emailVerificationRateLimit = limited(60 * 60 * 1000, 3, "user");
export const chatRateLimit = limited(60 * 1000, 30, "user", chatQuota);
export function createGlobalRateLimit(): RequestHandler { return limited(15 * 60 * 1000, 1000, "ip"); }
export const reportRateLimit = limited(60 * 60 * 1000, 5, "user");
export const checkoutRateLimit = limited(10 * 60 * 1000, 10, "user");
