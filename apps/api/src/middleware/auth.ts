import type { NextFunction, Request, Response } from "express";
import type { User } from "@prisma/client";
import { API_ERROR_CODES } from "@remarket/shared";
import { prisma } from "../utils/prisma.js";
import { env } from "../config/env.js";
import { verifyAccessToken } from "../shared/tokens.js";
import { envelopeMeta } from "../shared/api-response.js";
import { sessionProfileSelect } from "../shared/dto-mappers.js";
import type { SessionProfile } from "../shared/dto-mappers.js";

/**
 * Authentication middleware (detail-project 5/6).
 *
 * The JWT is only a pointer: every protected request reloads the session and
 * the user from the database, so revocation, lockout and role changes take
 * effect immediately instead of waiting for the token to expire.
 *
 * A LOCKED user is deliberately NOT rejected here — they keep access to
 * orders, notifications, support and logout (detail-project 6). Individual
 * routes apply the stricter policy they need.
 */

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: "USER" | "ADMIN";
  status: "ACTIVE" | "LOCKED";
  emailVerifiedAt: Date | null;
}

export interface AuthRequest extends Request {
  user?: AuthUser;
  sessionId?: string;
  /** Fresh identity from this request, reused by /auth/me; never cached across requests. */
  sessionUser?: SessionProfile;
  /** Set when a valid token was presented but no session was required. */
  optionalUser?: AuthUser | null;
}

function sendAuthError(res: Response, code: string, message: string, status: number): Response {
  return res.status(status).json({
    success: false,
    error: { code, message },
    meta: envelopeMeta(res),
  });
}

async function loadUser(sessionId: string, userId: string): Promise<{ user: AuthUser; profile: SessionProfile } | null> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { userId: true, revokedAt: true, expiresAt: true, user: { select: sessionProfileSelect } },
  });
  const user = session?.user;

  if (!session || session.userId !== userId) return null;
  if (session.revokedAt !== null) return null;
  if (session.expiresAt.getTime() <= Date.now()) return null;
  if (!user) return null;

  return {
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      status: user.status,
      emailVerifiedAt: user.emailVerifiedAt,
    },
    profile: user,
  };
}

function bearer(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  return token.length > 0 ? token : null;
}

/** Requires a live session; returns 401 otherwise. */
export async function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  res.setHeader("Cache-Control", "no-store");
  try {
    const token = bearer(req);
    if (!token) {
      return sendAuthError(res, API_ERROR_CODES.UNAUTHORIZED, "Bạn cần đăng nhập để tiếp tục.", 401);
    }

    const access = verifyAccessToken(token);
    if (!access) {
      return sendAuthError(res, API_ERROR_CODES.UNAUTHORIZED, "Phiên đăng nhập không hợp lệ.", 401);
    }

    const loaded = await loadUser(access.sessionId, access.userId);
    if (!loaded) {
      return sendAuthError(res, API_ERROR_CODES.SESSION_EXPIRED, "Phiên đăng nhập đã hết hạn.", 401);
    }

    req.user = loaded.user;
    req.sessionUser = loaded.profile;
    req.sessionId = access.sessionId;
    next();
  } catch (error) {
    next(error);
  }
}

/** Populates `req.user` when a valid session exists, never rejects. */
export async function optionalAuth(req: AuthRequest, _res: Response, next: NextFunction) {
  try {
    const token = bearer(req);
    if (!token) {
      req.user = undefined;
      return next();
    }
    _res.setHeader("Cache-Control", "no-store");
    const access = verifyAccessToken(token);
    if (!access) {
      req.user = undefined;
      return next();
    }
    const loaded = await loadUser(access.sessionId, access.userId);
    req.user = loaded?.user;
    req.sessionUser = loaded?.profile;
    req.sessionId = access.sessionId;
    next();
  } catch (error) {
    next(error);
  }
}

/** Route policy for restricted screens; runs after `authMiddleware`. */
export function requireRole(role: "USER" | "ADMIN") {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return sendAuthError(res, API_ERROR_CODES.UNAUTHORIZED, "Bạn cần đăng nhập để tiếp tục.", 401);
    }
    if (req.user.role !== role) {
      return sendAuthError(res, API_ERROR_CODES.FORBIDDEN, "Bạn không có quyền thực hiện thao tác này.", 403);
    }
    if (req.user.status !== "ACTIVE") {
      return sendAuthError(res, API_ERROR_CODES.ACCOUNT_LOCKED, "Tài khoản đang bị hạn chế.", 403);
    }
    next();
  };
}

/** Marketplace mutations need an ACTIVE account (detail-project 6). */
export function requireActive(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    return sendAuthError(res, API_ERROR_CODES.UNAUTHORIZED, "Bạn cần đăng nhập để tiếp tục.", 401);
  }
  if (req.user.status !== "ACTIVE") {
    return sendAuthError(res, API_ERROR_CODES.ACCOUNT_LOCKED, "Tài khoản đang bị hạn chế.", 403);
  }
  next();
}

/** Buying and messaging additionally require a verified email. */
export function requireVerified(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    return sendAuthError(res, API_ERROR_CODES.UNAUTHORIZED, "Bạn cần đăng nhập để tiếp tục.", 401);
  }
  if (req.user.status !== "ACTIVE") {
    return sendAuthError(res, API_ERROR_CODES.ACCOUNT_LOCKED, "Tài khoản đang bị hạn chế.", 403);
  }
  if (req.user.emailVerifiedAt === null) {
    return sendAuthError(
      res,
      API_ERROR_CODES.EMAIL_NOT_VERIFIED,
      "Vui lòng xác minh email để mua hàng và nhắn tin.",
      403,
    );
  }
  next();
}

export function viewerOf(req: AuthRequest): {
  id: string;
  status: "ACTIVE" | "LOCKED";
} | null {
  if (!req.user) return null;
  return { id: req.user.id, status: req.user.status };
}

export { env };
