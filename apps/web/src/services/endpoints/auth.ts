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
export const auth: AuthApi = {
  /** Restore only this tab's cookie, with 200/null for an anonymous visitor. */
  bootstrap: () => http.restoreSession(),
  me: () => http.readSession(),
  register: (input) => http.post("/auth/register", input),
  login: (email, password) => http.changeSession(async (assertCurrent) => {
    // A duplicated/opened tab may inherit sessionStorage. A fresh scope on login
    // leaves the original tab's cookie untouched, even when login fails.
    const scope = crypto.randomUUID();
    const data = await http.post<{ access_token: string; user: SessionUser }>("/auth/login", {
      email,
      password,
    }, undefined, { "X-Session-Scope": scope });
    assertCurrent();
    http.applyCredentials(data, true, scope);
    return data.user;
  }),
  logout: () => http.changeSession(async (assertCurrent) => {
    await http.post("/auth/logout");
    assertCurrent();
    http.setAccessToken(null);
  }),
  logoutAll: async () => {
    // Non-consuming discovery supplies a fresh access token even after expiry.
    requireSession(await http.restoreSession());
    await http.changeSession(async (assertCurrent) => {
      await http.post("/auth/logout-all");
      assertCurrent();
      http.setAccessToken(null);
    });
  },
  verifyEmail: (token) => http.changeSession(async (assertCurrent) => {
    const scope = crypto.randomUUID();
    const data = await http.post<{ access_token: string; user: SessionUser }>("/auth/verify-email", { token }, undefined, { "X-Session-Scope": scope });
    assertCurrent();
    http.applyCredentials(data, true, scope);
    return requireSession(data.user);
  }),
  resendVerification: (email) => http.post("/auth/resend-verification", { email }),
  emailVerificationRequest: () => http.get("/auth/email-verification-request"),
  requestEmailVerification: () => http.post("/auth/email-verification-request", {}),
  forgotPassword: (email) => http.post("/auth/forgot-password", { email }),
  resetPassword: (token, password) => http.changeSession(async (assertCurrent) => {
    const result = await http.post<{ accepted: true }>("/auth/reset-password", { token, password });
    assertCurrent();
    http.setAccessToken(null);
    return result;
  }),
  updateProfile: (input) => http.patch("/auth/profile", input),
  uploadAvatar: (storagePath) => http.patch("/auth/avatar", { storage_path: storagePath }),
};
