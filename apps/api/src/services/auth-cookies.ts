import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env.js";
import { forbidden, validationError } from "../shared/errors.js";
import { authTransport, readNativeRefresh, nativeAuthOnly } from "./auth-transport.js";

export const DAY_MS = 24 * 60 * 60 * 1000;

export const REFRESH_MS = env.refreshTtlDays * DAY_MS;

export const REFRESH_COOKIE_PATH = "/api/v1/auth";

/** The scope selects a cookie, never grants access; the opaque token is still required. */
export function refreshCookieName(req: Request): string {
  const scope = req.headers["x-session-scope"];
  if (scope === undefined) return env.refreshCookie;
  if (typeof scope !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(scope)) {
    throw validationError("Mã phiên tab không hợp lệ.");
  }
  return `${env.refreshCookie}_${scope}`;
}

export function setRefreshCookie(req: Request, res: Response, token: string): void {
  if (authTransport(req) === "MOBILE") {
    res.locals.nativeRefreshToken = token;
    return;
  }
  res.cookie(refreshCookieName(req), token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.cookieSecure,
    path: REFRESH_COOKIE_PATH,
    maxAge: REFRESH_MS,
  });
}

export function clearRefreshCookie(req: Request, res: Response): void {
  if (authTransport(req) === "MOBILE") return;
  res.clearCookie(refreshCookieName(req), {
    httpOnly: true,
    sameSite: "lax",
    secure: env.cookieSecure,
    path: REFRESH_COOKIE_PATH,
  });
}

export function readRefreshCookie(req: Request): string | null {
  if (authTransport(req) === "MOBILE") return readNativeRefresh(req);
  const cookieName = refreshCookieName(req);
  const header = req.headers.cookie;
  if (!header) return null;
  for (const pair of header.split(";")) {
    const eq = pair.indexOf("=");
    if (eq === -1) continue;
    if (pair.slice(0, eq).trim() !== cookieName) continue;
    const raw = pair.slice(eq + 1).trim();
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return null;
}

/** Browser endpoints that create, rotate or clear a cookie require a trusted Origin. */
export function requireTrustedOrigin(req: Request, _res: Response, next: NextFunction): void {
  if (authTransport(req) === "MOBILE") return nativeAuthOnly(req, _res, next);
  // Validate before any DB writes or Set-Cookie side effects.
  refreshCookieName(req);
  const value = req.headers.origin;
  if (!value) {
    if (env.isProduction) throw forbidden("Nguồn yêu cầu không được phép.");
    next();
    return;
  }
  let origin: string;
  try {
    origin = new URL(value).origin;
  } catch {
    throw forbidden("Nguồn yêu cầu không được phép.");
  }
  if (value !== origin || !env.corsOrigins.includes(origin)) throw forbidden("Nguồn yêu cầu không được phép.");
  next();
}
