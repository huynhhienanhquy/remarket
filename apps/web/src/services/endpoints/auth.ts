import type { SessionUser } from "@remarket/shared";
import type { AuthApi } from "@/types/api";
import { ApiError } from "@/helpers/errors";
import { http } from "@/services/http";

/** Post-login bootstrap expects a session; a 401 there means login failed. */
function requireSession(user: SessionUser | null): SessionUser {
  if (user === null) {
    throw new ApiError({
      code: "UNAUTHORIZED",
      message: "Phiên đăng nhập chưa hợp lệ.",
      status: 401,
    });
  }
  return user;
}

/**
 * Live implementation of the adapter contract. Every method maps 1:1 to a
 * documented endpoint (detail-project 14.1).
 */
export function createAuthEndpoints(transport = http): AuthApi {
  return {
    /** Restore only this tab's cookie, with 200/null for an anonymous visitor. */
    bootstrap: () => transport.restoreSession(),
    me: () => transport.readSession(),
    register: (input) => transport.post("/auth/register", input),
    login: (email, password) => transport.changeSession(async (assertCurrent) => {
      // A duplicated/opened tab may inherit sessionStorage. A fresh scope on login
      // leaves the original tab's cookie untouched, even when login fails.
      const scope = crypto.randomUUID();
      const data = await transport.post<{ access_token: string; user: SessionUser }>("/auth/login", {
        email,
        password,
      }, undefined, { "X-Session-Scope": scope });
      assertCurrent();
      transport.applyCredentials(data, true, scope);
      return data.user;
    }),
    logout: () => transport.changeSession(async (assertCurrent) => {
      await transport.post("/auth/logout");
      assertCurrent();
      transport.setAccessToken(null);
    }),
    logoutAll: async () => {
      // Non-consuming discovery supplies a fresh access token even after expiry.
      requireSession(await transport.restoreSession());
      await transport.changeSession(async (assertCurrent) => {
        await transport.post("/auth/logout-all");
        assertCurrent();
        transport.setAccessToken(null);
      });
    },
    verifyEmail: (token) => transport.changeSession(async (assertCurrent) => {
      const scope = crypto.randomUUID();
      const data = await transport.post<{ access_token: string; user: SessionUser }>("/auth/verify-email", { token }, undefined, { "X-Session-Scope": scope });
      assertCurrent();
      transport.applyCredentials(data, true, scope);
      return requireSession(data.user);
    }),
    resendVerification: (email) => transport.post("/auth/resend-verification", { email }),
    emailVerificationRequest: () => transport.get("/auth/email-verification-request"),
    requestEmailVerification: () => transport.post("/auth/email-verification-request", {}),
    forgotPassword: (email) => transport.post("/auth/forgot-password", { email }),
    resetPassword: (token, password) => transport.changeSession(async (assertCurrent) => {
      const result = await transport.post<{ accepted: true }>("/auth/reset-password", { token, password });
      assertCurrent();
      transport.setAccessToken(null);
      return result;
    }),
    updateProfile: (input) => transport.patch("/auth/profile", input),
    uploadAvatar: (storagePath) => transport.patch("/auth/avatar", { storage_path: storagePath }),
  };
}

export const auth = createAuthEndpoints();
