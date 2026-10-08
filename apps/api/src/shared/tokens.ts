import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

/**
 * Token primitives (detail-project 5).
 *
 * The access token is a short-lived JWT that only carries `sub` + `session_id`
 * — no role, status or PII, because the DB is the authority on authorization.
 * The refresh token is an opaque 256-bit random string kept in an httpOnly
 * cookie; only its SHA-256 digest is ever stored.
 */

export interface AccessTokenClaims {
  sub: string;
  session_id: string;
  iss: string;
  aud: string;
}

export function signAccessToken(userId: string, sessionId: string): string {
  return jwt.sign(
    { session_id: sessionId },
    env.jwtSecret,
    {
      subject: userId,
      issuer: env.jwtIssuer,
      audience: env.jwtAudience,
      algorithm: env.jwtAlgorithm,
      expiresIn: env.accessTokenTtl as jwt.SignOptions["expiresIn"],
    },
  );
}

export interface VerifiedAccess {
  userId: string;
  sessionId: string;
  expiresAt: number;
}

export function verifyAccessToken(token: string): VerifiedAccess | null {
  try {
    const decoded = jwt.verify(token, env.jwtSecret, {
      issuer: env.jwtIssuer,
      audience: env.jwtAudience,
      algorithms: [env.jwtAlgorithm],
    }) as jwt.JwtPayload & { session_id?: unknown };
    if (typeof decoded.sub !== "string" || !decoded.sub.trim() || typeof decoded.session_id !== "string" || !decoded.session_id.trim()
      || typeof decoded.exp !== "number" || typeof decoded.iat !== "number" || decoded.iat > Math.floor(Date.now() / 1000)
      || decoded.exp <= decoded.iat) return null;
    return { userId: decoded.sub, sessionId: decoded.session_id, expiresAt: decoded.exp * 1000 };
  } catch {
    return null;
  }
}

/** 256 bits of entropy, URL safe so it survives an httpOnly cookie unchanged. */
export function newRefreshToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

/** SHA-256 hex digest — what lands in the database for refresh/email tokens. */
export function sha256(value: string): string {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

export function newEmailToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}
