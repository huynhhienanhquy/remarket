import { Prisma } from "@prisma/client";
import {
  API_ERROR_CODES,
  validateEmail,
  validateFullName,
  validatePassword,
  validatePasswordConfirm,
  validatePhone,
} from "@remarket/shared";
import bcrypt from "bcryptjs";
import type { Request, Response } from "express";
import { Router } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import type { AuthRequest } from "../middleware/auth.js";
import { authMiddleware, requireActive } from "../middleware/auth.js";
import { AppError, asyncHandler } from "../middleware/errorHandler.js";
import { emailTokenRateLimit, emailVerificationRateLimit, loginRateLimit } from "../middleware/rate-limit.js";
import { enqueueOutbox } from "../outbox/outbox.js";
import { publishRealtimeEvent } from "../realtime/events.js";
import { clearRefreshCookie, readRefreshCookie, REFRESH_MS, requireTrustedOrigin, setRefreshCookie } from "../services/auth-cookies.js";
import { consumeEmailToken, createEmailToken, issueEmailToken } from "../services/email-tokens.js";
import { requestEmailVerification, toEmailVerificationRequest } from "../services/email-verification.js";
import { RateQuota } from "../services/rate-quota.js";
import { lockRefreshState } from "../services/refresh-locks.js";
import { createSession, rotateSessionRecords } from "../services/session-issuance.js";
import { authTransport, authSessionResponse } from "../services/auth-transport.js";
import { ok } from "../shared/api-response.js";
import { sessionProfileSelect, toSessionUser } from "../shared/dto-mappers.js";
import { accountLocked, unauthorized, validationError } from "../shared/errors.js";
import { isKnownProvinceCode } from "../shared/geography.js";
import { newEmailToken, newRefreshToken, sha256, signAccessToken, verifyAccessToken } from "../shared/tokens.js";
import { prisma } from "../utils/prisma.js";

/**
 * Authentication endpoints (detail-project 5).
 *
 * - Access token: 15 min JWT carrying only `sub` + `session_id`.
 * - Refresh token: opaque 256-bit string in an httpOnly cookie scoped to
 *   `/api/v1/auth`; the database only ever stores its SHA-256, rotates on every
 *   refresh and revokes the whole session when an already-rotated token is
 *   replayed (reuse detection, detail-project 5.2).
 * - Email tokens: one-time `AuthToken` rows (VERIFY_EMAIL 24h,
 *   RESET_PASSWORD 15 min), stored hashed and consumed exactly once.
 * - Development logs email tokens locally; production encrypts and queues
 *   delivery through the durable SMTP outbox.
 */

const VERIFY_EMAIL_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_PASSWORD_TTL_MS = 15 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;

/* ------------------------------------------------------------------ *
 * Session + email token primitives
 * ------------------------------------------------------------------ */

function sessionExpired(): AppError {
  return new AppError(
    API_ERROR_CODES.SESSION_EXPIRED,
    "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.",
    401,
  );
}

/** Keeps login timing close for unknown emails (no user enumeration). */
let dummyHash: string | undefined;
async function compareAgainstDummy(password: string): Promise<void> {
  dummyHash ??= await bcrypt.hash("remarket-unknown-account", env.bcryptCost);
  await bcrypt.compare(password, dummyHash);
}

/* ------------------------------------------------------------------ *
 * Resend-verification cooldown — keyed by the submitted email only, so a
 * known and an unknown address take exactly the same code path.
 * ------------------------------------------------------------------ */

const resendQuota = new RateQuota(RESEND_COOLDOWN_MS, 1);

function recordResendAttempt(email: string): number | null {
  const result = resendQuota.consume(email);
  return result.allowed ? null : result.retryAfter;
}

/* ------------------------------------------------------------------ *
 * Schemas (zod `.strict()`: no mass assignment, whitelist only)
 * ------------------------------------------------------------------ */

const registerSchema = z
  .object({
    full_name: z.string().max(200),
    email: z.string().max(254),
    password: z.string().max(200),
    confirm_password: z.string().max(200),
    phone: z.string().max(20),
  })
  .strict();

const loginSchema = z
  .object({
    email: z.string().max(254),
    password: z.string().max(200),
  })
  .strict();

const tokenSchema = z.object({ token: z.string().min(1).max(200) }).strict();

const emailSchema = z.object({ email: z.string().max(254) }).strict();

const resendSchema = z.object({ email: z.string().max(254) }).strict();

const resetSchema = z
  .object({
    token: z.string().min(1).max(200),
    password: z.string().max(200),
  })
  .strict();

const profileSchema = z
  .object({
    full_name: z.string().max(200).optional(),
    phone: z.string().max(20).nullable().optional(),
    province_code: z.string().max(20).nullable().optional(),
    default_address: z.string().max(300).nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Cần ít nhất một trường hồ sơ để cập nhật.",
  });

const avatarSchema = z.object({ storage_path: z.string().min(1).max(300) }).strict();

/* ------------------------------------------------------------------ *
 * Routes
 * ------------------------------------------------------------------ */

const router = Router();
const requireEmailDelivery = (_req: Request, _res: Response, next: () => void): void => {
  if (!env.emailEnabled) throw new AppError("EMAIL_DISABLED", "Bản demo không hỗ trợ gửi email đặt lại mật khẩu hoặc liên kết xác minh. Bạn vẫn có thể yêu cầu admin xác minh email.", 503);
  next();
};
// Identity and credentials must never be reused from a browser/proxy cache.
router.use((_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
  next();
});

// POST /api/v1/auth/register
router.post(
  "/register",
  emailTokenRateLimit,
  asyncHandler(async (req, res) => {
    const data = registerSchema.parse(req.body);

    const fields: Record<string, string> = {};
    const nameError = validateFullName(data.full_name);
    if (nameError) fields.full_name = nameError;
    const emailError = validateEmail(data.email);
    if (emailError) fields.email = emailError;
    const passwordError = validatePassword(data.password);
    if (passwordError) fields.password = passwordError;
    const confirmError = validatePasswordConfirm(data.password, data.confirm_password);
    if (confirmError) fields.confirm_password = confirmError;
    const phoneError = validatePhone(data.phone);
    if (phoneError) fields.phone = phoneError;
    if (Object.keys(fields).length > 0) {
      throw validationError("Thông tin đăng ký chưa hợp lệ.", fields);
    }

    const email = data.email.trim().toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) {
      throw validationError("Email đã được sử dụng.", { email: "Email đã được sử dụng." });
    }

    const passwordHash = await bcrypt.hash(data.password, env.bcryptCost);
    const token = newEmailToken();
    let user: { email: string };
    try {
      user = await prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            fullName: data.full_name.trim(),
            email,
            phone: data.phone.trim(),
            passwordHash,
          },
        });
        await createEmailToken(tx, {
          userId: created.id,
          recipient: created.email,
          purpose: "VERIFY_EMAIL",
          ttlMs: VERIFY_EMAIL_TTL_MS,
          token,
          mobile: authTransport(req) === "MOBILE",
        });
        return created;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw validationError("Email đã được sử dụng.", { email: "Email đã được sử dụng." });
      }
      throw error;
    }
    if (!env.isProduction) console.log(`[dev] verify token: ${token}`);

    ok(res, { pending_verification: true as const, email: user.email }, 201);
  }),
);

// POST /api/v1/auth/login — one generic error for unknown email and wrong
// password; a LOCKED account may still log in to restricted mode (detail 6).
router.post(
  "/login",
  loginRateLimit,
  requireTrustedOrigin,
  asyncHandler(async (req, res) => {
    const data = loginSchema.parse(req.body);
    const email = data.email.trim().toLowerCase();
    // bcrypt compares only the first 72 bytes; never silently accept a suffix.
    if (Buffer.byteLength(data.password, "utf8") > 72) throw unauthorized("Email hoặc mật khẩu không đúng.");

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      await compareAgainstDummy(data.password);
      throw unauthorized("Email hoặc mật khẩu không đúng.");
    }

    const matches = await bcrypt.compare(data.password, user.passwordHash);
    if (!matches) {
      throw unauthorized("Email hoặc mật khẩu không đúng.");
    }

    const { issued, identity } = await prisma.$transaction(async (tx) => {
      // Password reset/account revocation also locks User first. Never issue a
      // new session from the password snapshot read before bcrypt completed.
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${user.id} FOR UPDATE`;
      const live = await tx.user.findUnique({ where: { id: user.id } });
      if (!live || live.deletedAt || live.passwordHash !== user.passwordHash) throw unauthorized("Email hoặc mật khẩu không đúng.");
      return { issued: await createSession(tx, live.id, authTransport(req)), identity: live };
    });
    setRefreshCookie(req, res, issued.refreshToken);
    // Login already loaded the identity; avoid a second HTTP + DB round trip.
    authSessionResponse(req, res, { access_token: issued.accessToken, user: toSessionUser(identity) });
  }),
);

/** Guest discovery must not manufacture 401 errors or hide database failures. */
function unavailableSession(req: Request, res: Response, bootstrap: boolean) {
  clearRefreshCookie(req, res);
  if (bootstrap) return ok(res, { user: null, access_token: null });
  throw sessionExpired();
}

// Discovery validates the cookie without consuming it. A cancelled navigation
// must not lose the session because its Set-Cookie response was never received.
// Explicit refresh retains atomic rotation and strict replay detection.
async function refreshSession(req: Request, res: Response, bootstrap = false) {
  const presented = readRefreshCookie(req);
  if (!presented) return unavailableSession(req, res, bootstrap);

  const presentedHash = sha256(presented);
  const candidate = await prisma.authToken.findUnique({ where: { tokenHash: presentedHash } });
  if (!candidate || candidate.purpose !== "REFRESH" || !candidate.sessionId) {
    return unavailableSession(req, res, bootstrap);
  }
  const candidateSessionId = candidate.sessionId;

  const nextToken = newRefreshToken();
  const nextHash = sha256(nextToken);
  const result = await prisma.$transaction(async (tx) => {
    // Global auth lock order: User -> Session -> AuthToken. Account locking,
    // password reset and refresh rotation use the same order to avoid a
    // session/token deadlock under concurrent revocation.
    const locked = await lockRefreshState(tx, { id: candidate.id, userId: candidate.userId, sessionId: candidateSessionId });
    if (!locked) return { kind: "invalid" as const };
    const { user, session, token: current } = locked;
    if (user.deletedAt) return { kind: "invalid" as const };
    if (session.transport !== authTransport(req)) return { kind: "invalid" as const };
    if (
      !current ||
      !session ||
      current.purpose !== "REFRESH" ||
      current.sessionId !== session.id ||
      current.userId !== session.userId
    ) return { kind: "invalid" as const };
    if (bootstrap && !user) return { kind: "invalid" as const };

    const now = new Date();
    // Only a still-valid, already-used credential is evidence of replay.
    if (current.expiresAt.getTime() <= now.getTime()) return { kind: "invalid" as const };
    if (current.consumedAt !== null) {
      await tx.session.updateMany({
        where: { id: session.id, revokedAt: null },
        data: { revokedAt: now },
      });
      await enqueueOutbox(
        tx,
        "session.revoked",
        session.id,
        `session-revoked:refresh-reuse:${session.id}`,
        { session_ids: [session.id] },
      );
      return { kind: "reused" as const, sessionId: session.id, userId: session.userId };
    }
    if (
      current.expiresAt.getTime() <= now.getTime() ||
      session.revokedAt !== null ||
      session.expiresAt.getTime() <= now.getTime()
    ) {
      return { kind: "invalid" as const };
    }
    if (session.refreshHash !== presentedHash) {
      await tx.session.update({ where: { id: session.id }, data: { revokedAt: now } });
      await enqueueOutbox(
        tx,
        "session.revoked",
        session.id,
        `session-revoked:refresh-mismatch:${session.id}`,
        { session_ids: [session.id] },
      );
      return { kind: "reused" as const, sessionId: session.id, userId: session.userId };
    }

    if (bootstrap) return { kind: "discovered" as const, userId: current.userId, sessionId: session.id, user };
    const expiresAt = new Date(now.getTime() + REFRESH_MS);
    // Lock order/checks remain above. Combine only the dependent writes so
    // a token conflict or session-update failure rolls back every change.
    const rotated = await rotateSessionRecords(tx, {
      tokenId: current.id, sessionId: session.id, presentedHash, nextHash, now, expiresAt,
    });
    if (rotated !== 1) throw sessionExpired();
    return {
      kind: "rotated" as const,
      userId: current.userId,
      sessionId: session.id,
      user,
    };
  });
  if (result.kind === "reused") {
    publishRealtimeEvent({
      eventType: "session.revoked",
      aggregateId: result.sessionId,
      payload: { session_ids: [result.sessionId] },
    });
    return unavailableSession(req, res, bootstrap);
  }
  if (result.kind !== "rotated" && result.kind !== "discovered") return unavailableSession(req, res, bootstrap);

  if (bootstrap) {
    // Discovery does not extend the session lifetime or issue a new cookie.
    if (!result.user) return unavailableSession(req, res, true);
    return ok(res, { user: toSessionUser(result.user), access_token: signAccessToken(result.userId, result.sessionId) });
  }

  setRefreshCookie(req, res, nextToken);
  authSessionResponse(req, res, { access_token: signAccessToken(result.userId, result.sessionId), user: toSessionUser(result.user) });
}

// Anonymous/expired discovery is a successful empty session; DB errors still fail.
router.post("/bootstrap", requireTrustedOrigin, asyncHandler((req, res) => refreshSession(req, res, true)));
// Explicit refresh still returns 401 for absent/expired/replayed credentials.
router.post("/refresh", requireTrustedOrigin, asyncHandler((req, res) => refreshSession(req, res)));

// GET /api/v1/auth/me — protected identity lookup; anonymous discovery uses bootstrap.
router.get(
  "/me",
  authMiddleware,
  asyncHandler(async (req: AuthRequest, res) => {
    const authUser = req.user;
    if (!authUser) throw unauthorized();

    const user = req.sessionUser;
    if (!user) throw unauthorized();

    ok(res, toSessionUser(user));
  }),
);

// POST /api/v1/auth/logout
router.post(
  "/logout",
  requireTrustedOrigin,
  asyncHandler(async (req, res) => {
    // Logout is idempotent, including after access expiry/revocation. The
    // trusted-Origin httpOnly cookie can revoke its own session without JWT.
    const raw = readRefreshCookie(req);
    const candidate = raw ? await prisma.authToken.findUnique({ where: { tokenHash: sha256(raw) } }) : null;
    const cookieSession = candidate?.purpose === "REFRESH" && candidate.sessionId ? candidate : null;
    if (authTransport(req) === "MOBILE" && cookieSession) {
      const session = await prisma.session.findUnique({ where: { id: cookieSession.sessionId! } });
      if (!session || session.transport !== "MOBILE") throw unauthorized();
    }
    const header = req.headers.authorization;
    const access = authTransport(req) === "WEB" && header?.startsWith("Bearer ") ? verifyAccessToken(header.slice(7).trim()) : null;
    if (access && cookieSession && access.sessionId !== cookieSession.sessionId) {
      throw new AppError(API_ERROR_CODES.SESSION_CHANGED, "Phiên đăng nhập đã thay đổi. Vui lòng kiểm tra lại.", 409);
    }
    const sessionId = cookieSession?.sessionId ?? access?.sessionId;
    const userId = cookieSession?.userId ?? access?.userId;
    if (sessionId && userId) {
      const now = new Date();
      await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
        await tx.session.updateMany({
          where: { id: sessionId, userId, revokedAt: null },
          data: { revokedAt: now },
        });
        await tx.authToken.updateMany({
          where: { sessionId, purpose: "REFRESH", consumedAt: null },
          data: { consumedAt: now },
        });
        await enqueueOutbox(
          tx,
          "session.revoked",
          sessionId,
          `session-revoked:logout:${sessionId}`,
          { session_ids: [sessionId] },
        );
      });
      publishRealtimeEvent({
        eventType: "session.revoked",
        aggregateId: sessionId,
        payload: { session_ids: [sessionId] },
      });
    }
    clearRefreshCookie(req, res);
    ok(res, { ok: true });
  }),
);

// POST /api/v1/auth/logout-all
router.post(
  "/logout-all",
  requireTrustedOrigin,
  authMiddleware,
  asyncHandler(async (req: AuthRequest, res) => {
    const authUser = req.user;
    if (authUser) {
      const raw = readRefreshCookie(req);
      const cookieToken = raw ? await prisma.authToken.findUnique({ where: { tokenHash: sha256(raw) } }) : null;
      if (cookieToken?.purpose === "REFRESH" && cookieToken.sessionId && cookieToken.sessionId !== req.sessionId) {
        throw new AppError(API_ERROR_CODES.SESSION_CHANGED, "Phiên đăng nhập đã thay đổi. Vui lòng kiểm tra lại.", 409);
      }
      const now = new Date();
      await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${authUser.id} FOR UPDATE`;
        await tx.session.updateMany({
          where: { userId: authUser.id, revokedAt: null },
          data: { revokedAt: now },
        });
        await tx.authToken.updateMany({
          where: { userId: authUser.id, purpose: "REFRESH", consumedAt: null },
          data: { consumedAt: now },
        });
        await enqueueOutbox(
          tx,
          "session.revoked",
          authUser.id,
          `session-revoked:logout-all:${authUser.id}:${now.getTime()}`,
          { user_id: authUser.id },
        );
      });
      publishRealtimeEvent({
        eventType: "session.revoked",
        aggregateId: authUser.id,
        payload: { user_id: authUser.id },
      });
    }
    clearRefreshCookie(req, res);
    ok(res, { ok: true });
  }),
);

// A valid legacy email link proves account ownership, not admin approval.
router.get("/email-verification-request", authMiddleware, asyncHandler(async (req: AuthRequest, res) => {
  z.object({}).strict().parse(req.query);
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user) throw unauthorized();
  ok(res, toEmailVerificationRequest(user));
}));
router.post("/email-verification-request", requireTrustedOrigin, authMiddleware, requireActive, emailVerificationRateLimit,
  asyncHandler(async (req: AuthRequest, res) => {
    z.object({}).strict().parse(req.body);
    const result = await prisma.$transaction((tx) => requestEmailVerification(tx, req.user!.id));
    ok(res, result);
  }),
);

// POST /api/v1/auth/verify-email — submits the request and creates a session.
router.post(
  "/verify-email",
  requireTrustedOrigin,
  asyncHandler(async (req, res) => {
    const data = tokenSchema.parse(req.body);
    const { issued, user } = await prisma.$transaction(async (tx) => {
      const userId = await consumeEmailToken(tx, data.token, "VERIFY_EMAIL");
      if (!userId) {
        throw validationError("Liên kết xác minh không hợp lệ hoặc đã hết hạn.", {
          token: "Liên kết không hợp lệ hoặc đã hết hạn.",
        });
      }
      await requestEmailVerification(tx, userId);
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: sessionProfileSelect });
      return { issued: await createSession(tx, userId, authTransport(req)), user };
    });
    setRefreshCookie(req, res, issued.refreshToken);
    authSessionResponse(req, res, { access_token: issued.accessToken, user: toSessionUser(user) });
  }),
);

// POST /api/v1/auth/resend-verification — identical response whether or not
// the mailbox exists (detail 5.3): never reveal account existence.
router.post(
  "/resend-verification",
  requireEmailDelivery,
  emailTokenRateLimit,
  asyncHandler(async (req, res) => {
    const data = resendSchema.parse(req.body);
    const email = data.email.trim().toLowerCase();
    if (email === "") {
      throw validationError("Cần email để gửi lại liên kết xác minh.", {
        email: "Vui lòng nhập email.",
      });
    }

    const retryAfter = recordResendAttempt(email);
    if (retryAfter !== null) {
      ok(res, { retry_after: retryAfter });
      return;
    }

    const user = await prisma.user.findUnique({ where: { email }, select: { id: true, emailVerifiedAt: true } });
    if (user && user.emailVerifiedAt === null) {
      await issueEmailToken(user.id, email, "VERIFY_EMAIL", VERIFY_EMAIL_TTL_MS, "verify token", authTransport(req) === "MOBILE");
    }

    ok(res, {});
  }),
);

// POST /api/v1/auth/forgot-password — always accepted, never reveals whether
// the address is registered (detail 5.3).
router.post(
  "/forgot-password",
  requireEmailDelivery,
  emailTokenRateLimit,
  asyncHandler(async (req, res) => {
    const data = emailSchema.parse(req.body);
    const email = data.email.trim().toLowerCase();

    const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (user) {
      await issueEmailToken(user.id, email, "RESET_PASSWORD", RESET_PASSWORD_TTL_MS, "reset token", authTransport(req) === "MOBILE");
    }

    ok(res, { accepted: true as const });
  }),
);

// POST /api/v1/auth/reset-password — consumes the token, sets the new
// password and revokes every session; it does NOT verify the email.
router.post(
  "/reset-password",
  requireTrustedOrigin,
  asyncHandler(async (req, res) => {
    const data = resetSchema.parse(req.body);

    const passwordError = validatePassword(data.password);
    if (passwordError) {
      throw validationError(passwordError, { password: passwordError });
    }

    const passwordHash = await bcrypt.hash(data.password, env.bcryptCost);
    const resetUserId = await prisma.$transaction(async (tx) => {
      const userId = await consumeEmailToken(tx, data.token, "RESET_PASSWORD");
      if (!userId) {
        throw validationError("Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.", {
          token: "Liên kết không hợp lệ hoặc đã hết hạn.",
        });
      }
      await tx.user.update({ where: { id: userId }, data: { passwordHash } });
      await tx.session.updateMany({
        where: { userId },
        data: { revokedAt: new Date() },
      });
      await tx.authToken.updateMany({
        where: { userId, purpose: "REFRESH", consumedAt: null },
        data: { consumedAt: new Date() },
      });
      await enqueueOutbox(
        tx,
        "session.revoked",
        userId,
        `session-revoked:password-reset:${userId}:${Date.now()}`,
        { user_id: userId },
      );
      return userId;
    });

    publishRealtimeEvent({
      eventType: "session.revoked",
      aggregateId: resetUserId,
      payload: { user_id: resetUserId },
    });

    clearRefreshCookie(req, res);
    ok(res, { accepted: true as const });
  }),
);

// PATCH /api/v1/auth/profile — strict whitelist, no mass assignment.
router.patch(
  "/profile",
  authMiddleware,
  requireActive,
  asyncHandler(async (req: AuthRequest, res) => {
    const authUser = req.user;
    if (!authUser) throw unauthorized();

    const data = profileSchema.parse(req.body);
    const fields: Record<string, string> = {};
    const update: {
      fullName?: string;
      phone?: string | null;
      provinceCode?: string | null;
      defaultAddress?: string | null;
    } = {};

    if (data.full_name !== undefined) {
      const error = validateFullName(data.full_name);
      if (error) fields.full_name = error;
      else update.fullName = data.full_name.trim();
    }

    if (data.phone !== undefined) {
      if (data.phone === null || data.phone.trim() === "") {
        update.phone = null;
      } else {
        const error = validatePhone(data.phone);
        if (error) fields.phone = error;
        else update.phone = data.phone.trim();
      }
    }

    if (data.province_code !== undefined) {
      if (data.province_code === null || data.province_code.trim() === "") {
        update.provinceCode = null;
      } else {
        const code = data.province_code.trim();
        if (!isKnownProvinceCode(code)) {
          fields.province_code = "Tỉnh/thành phố không hợp lệ.";
        } else {
          update.provinceCode = code;
        }
      }
    }

    if (data.default_address !== undefined) {
      const address = (data.default_address ?? "").trim();
      update.defaultAddress = address === "" ? null : address;
    }

    if (Object.keys(fields).length > 0) {
      throw validationError("Thông tin hồ sơ chưa hợp lệ.", fields);
    }

    const user = await prisma.$transaction(async (tx) => {
      // Serialize profile writes with the admin account-lock orchestration.
      // A request that waited behind a lock must not mutate a now-locked user.
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${authUser.id} FOR UPDATE`;
      const liveUser = await tx.user.findUnique({
        where: { id: authUser.id },
        select: { status: true },
      });
      if (!liveUser || liveUser.status !== "ACTIVE") throw accountLocked();
      return tx.user.update({ where: { id: authUser.id }, data: update });
    });
    ok(res, toSessionUser(user));
  }),
);

// PATCH /api/v1/auth/avatar — only a storage path produced by this API for
// the caller is accepted; an external http(s) URL is rejected outright
// (detail 5.4). The namespace and UploadAsset row jointly prove ownership.
router.patch(
  "/avatar",
  authMiddleware,
  requireActive,
  asyncHandler(async (req: AuthRequest, res) => {
    const authUser = req.user;
    if (!authUser) throw unauthorized();

    const data = avatarSchema.parse(req.body);
    const storagePath = data.storage_path.trim();

    if (/^https?:\/\//i.test(storagePath) || storagePath.includes("://")) {
      throw validationError("Đường dẫn ảnh đại diện không hợp lệ.", {
        storage_path: "Không được dùng URL ngoài làm ảnh đại diện.",
      });
    }

    const expectedPrefix = `users/${authUser.id}/avatar/`;
    if (!storagePath.startsWith(expectedPrefix)) {
      throw validationError("Đường dẫn ảnh đại diện không hợp lệ.", {
        storage_path: "Ảnh đại diện phải thuộc về tài khoản của bạn.",
      });
    }

    const filename = storagePath.slice(expectedPrefix.length);
    if (
      filename === "" ||
      filename.includes("/") ||
      filename.includes("\\") ||
      filename.includes("..") ||
      !/^[A-Za-z0-9._-]+$/.test(filename) ||
      !/\.(jpg|jpeg|png|webp)$/i.test(filename)
    ) {
      throw validationError("Đường dẫn ảnh đại diện không hợp lệ.", {
        storage_path: "Tệp phải là ảnh JPG, PNG hoặc WebP được tải lên.",
      });
    }

    const user = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${authUser.id} FOR UPDATE`;
      const liveUser = await tx.user.findUnique({
        where: { id: authUser.id },
        select: { status: true },
      });
      if (!liveUser || liveUser.status !== "ACTIVE") throw accountLocked();

      await tx.$queryRaw`SELECT "id" FROM "UploadAsset" WHERE "storagePath" = ${storagePath} FOR UPDATE`;
      const asset = await tx.uploadAsset.findUnique({ where: { storagePath } });
      if (!asset || asset.userId !== authUser.id || asset.purpose !== "avatar") {
        throw validationError("Đường dẫn ảnh đại diện không hợp lệ.", {
          storage_path: "Ảnh chưa được tải lên bởi tài khoản này.",
        });
      }

      await tx.uploadAsset.updateMany({
        where: {
          userId: authUser.id,
          purpose: "avatar",
          attachedAt: { not: null },
          id: { not: asset.id },
        },
        data: { attachedAt: null },
      });
      await tx.uploadAsset.update({
        where: { id: asset.id },
        data: { attachedAt: new Date() },
      });
      return tx.user.update({
        where: { id: authUser.id },
        data: { avatarUrl: `/api/v1/uploads/${filename}` },
      });
    });
    ok(res, toSessionUser(user));
  }),
);

export { router as authRouter };
