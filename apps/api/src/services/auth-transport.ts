import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import type { SessionUser } from "@remarket/shared";
import { forbidden } from "../shared/errors.js";
import { ok } from "../shared/api-response.js";

/** Selected only by the server mount, never by a caller-controlled header. */
export function authTransport(req: Request): "WEB" | "MOBILE" {
  return req.baseUrl === "/api/v1/auth/mobile" ? "MOBILE" : "WEB";
}

export function nativeAuthOnly(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  // Native credentials are never sourced from the browser's ambient cookie jar.
  if (req.headers.origin !== undefined || req.headers.cookie !== undefined) {
    throw forbidden(
      "Luồng đăng nhập thiết bị không nhận cookie hoặc Origin của trình duyệt.",
    );
  }
  next();
}

const refreshInput = z
  .object({
    refresh_token: z
      .string()
      .regex(/^[A-Za-z0-9_-]{43}$/)
      .optional(),
  })
  .strict();
export function readNativeRefresh(req: Request): string | null {
  return refreshInput.parse(req.body ?? {}).refresh_token ?? null;
}

export function authSessionResponse(
  req: Request,
  res: Response,
  data: { access_token: string | null; user: SessionUser | null },
): Response {
  if (
    authTransport(req) === "MOBILE" &&
    typeof res.locals.nativeRefreshToken === "string"
  ) {
    return ok(res, {
      ...data,
      refresh_token: res.locals.nativeRefreshToken as string,
    });
  }
  return ok(res, data);
}
