import type { NextFunction, Request, Response } from "express";
import crypto from "node:crypto";

const SAFE_ID = /^[A-Za-z0-9._-]{1,128}$/;

/**
 * Request id (detail-project 4.1). A caller-supplied `X-Request-Id` is only
 * adopted when it is well formed, otherwise a fresh UUID is minted so log
 * correlation can never be spoofed with arbitrary text.
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header("x-request-id");
  const id = incoming && SAFE_ID.test(incoming) ? incoming : crypto.randomUUID();
  res.locals.requestId = id;
  res.setHeader("X-Request-Id", id);
  next();
}
