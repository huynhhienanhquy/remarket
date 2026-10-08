import type { Province } from "@remarket/shared";
import { PROVINCES, validateEmail, validatePassword, validatePhone, validateFullName } from "@remarket/shared";
import type { AuthApi, CategoriesApi, RegisterInput, UploadsApi } from "../lib/api/contract";
import { avatarPlaceholder, placeholderImage } from "./placeholder";
import { currentUserId, db, setCurrentUserId } from "./store";
import {
  mustFindUser,
  requireAuth,
  requireActive,
  validationError,
  fail,
} from "./adapter-helpers";
import { API_ERROR_CODES } from "@remarket/shared";
import { projectEmailVerification, requestMockEmailVerification } from "./email-verification";

/**
 * Mock auth keeps a user id in localStorage (never a password or token) and
 * simulates the email-verification and rate-limit flows of detail-project 4
 * without a mail server.
 */
const TOKEN_KEY = "remarket.mock.tokens";
const RESEND_KEY = "remarket.mock.resend";

interface TokenMap {
  [token: string]: string;
}

function tokens(): TokenMap {
  try {
    return JSON.parse(localStorage.getItem(TOKEN_KEY) ?? "{}") as TokenMap;
  } catch {
    return {};
  }
}

function issueToken(userId: string): string {
  const map = tokens();
  const token = `mock-verify-${Math.random().toString(36).slice(2, 10)}`;
  map[token] = userId;
  localStorage.setItem(TOKEN_KEY, JSON.stringify(map));
  return token;
}

function consumeToken(token: string): string | null {
  const map = tokens();
  const userId = map[token];
  if (!userId) return null;
  delete map[token];
  localStorage.setItem(TOKEN_KEY, JSON.stringify(map));
  return userId;
}

function viewer() {
  const id = currentUserId();
  return id ? (db().users.find((entry) => entry.id === id) ?? null) : null;
}

/** Mock resend limit: 3 requests per hour per account (detail-project 16). */
function checkResendLimit(email: string): number {
  let entries: Record<string, number[]> = {};
  try {
    entries = JSON.parse(localStorage.getItem(RESEND_KEY) ?? "{}") as Record<string, number[]>;
  } catch {
    entries = {};
  }
  const now = Date.now();
  const recent = (entries[email] ?? []).filter((at) => now - at < 60 * 60 * 1000);
  if (recent.length >= 3) {
    const retryAfter = Math.ceil((recent[0]! + 60 * 60 * 1000 - now) / 1000);
    fail(429, API_ERROR_CODES.RATE_LIMITED, "Đã đạt giới hạn gửi lại email.", {
      retry_after: retryAfter,
    });
  }
  recent.push(now);
  entries[email] = recent;
  localStorage.setItem(RESEND_KEY, JSON.stringify(entries));
  return 0;
}

export const authApi: AuthApi = {
  async bootstrap() {
    return this.me();
  },
  async me() {
    const user = viewer();
    if (!user) return null;
    const { password: _password, ...rest } = user;
    return rest;
  },

  async register(input: RegisterInput) {
    const fullName = input.full_name.trim();
    const email = input.email.trim().toLowerCase();
    const errors: Record<string, string> = {};

    const nameError = validateFullName(fullName);
    if (nameError) errors.full_name = nameError;
    const emailError = validateEmail(email);
    if (emailError) errors.email = emailError;
    const passwordError = validatePassword(input.password);
    if (passwordError) errors.password = passwordError;
    if (input.password !== input.confirm_password) {
      errors.confirm_password = "Mật khẩu nhập lại không khớp.";
    }
    const phoneError = validatePhone(input.phone);
    if (phoneError) errors.phone = phoneError;

    if (Object.keys(errors).length > 0) {
      validationError("Thông tin đăng ký chưa hợp lệ.", errors);
    }
    if (db().users.some((entry) => entry.email === email)) {
      validationError("Email đã được sử dụng.", { email: "Email đã được sử dụng." });
    }

    const id = `00000001-0000-4000-8000-${(db().users.length + 100).toString(16).padStart(12, "0")}`;
    db().users.push({
      id,
      full_name: fullName,
      email,
      password: input.password,
      avatar_url: avatarPlaceholder(fullName),
      phone: input.phone.trim(),
      province_code: null,
      default_address: null,
      role: "USER",
      status: "ACTIVE",
      email_verified_at: null,
      joined_at: new Date().toISOString(),
      lock_reason: null,
      locked_at: null,
    });
    issueToken(id);
    return { pending_verification: true as const, email };
  },

  async login(email, password) {
    const normalized = email.trim().toLowerCase();
    const user = db().users.find((entry) => entry.email === normalized);
    // One generic message for unknown email and wrong password (4.2).
    if (!user || user.password !== password) {
      fail(401, API_ERROR_CODES.UNAUTHORIZED, "Email hoặc mật khẩu không đúng.");
    }
    setCurrentUserId(user.id);
    const { password: _password, ...rest } = user;
    return rest;
  },

  async logout() {
    setCurrentUserId(null);
  },

  async logoutAll() {
    setCurrentUserId(null);
  },

  async verifyEmail(token) {
    const userId = consumeToken(token.trim());
    if (!userId) {
      fail(400, API_ERROR_CODES.VALIDATION_ERROR, "Liên kết xác minh không hợp lệ hoặc đã hết hạn.");
    }
    const user = mustFindUser(db(), userId);
    requestMockEmailVerification(user);
    setCurrentUserId(user.id);
    const { password: _password, ...rest } = user;
    return rest;
  },

  async resendVerification(email) {
    const target = email?.trim().toLowerCase() ?? viewer()?.email;
    if (!target) {
      validationError("Cần email để gửi lại liên kết xác minh.", { email: "Bắt buộc." });
    }
    const user = db().users.find((entry) => entry.email === target);
    // Same generic response whether or not the email exists (4.3).
    if (user && user.email_verified_at === null) {
      checkResendLimit(target);
      issueToken(user.id);
    }
    return {};
  },

  async emailVerificationRequest() {
    return projectEmailVerification(requireAuth(viewer()));
  },
  async requestEmailVerification() {
    return requestMockEmailVerification(requireActive(viewer()));
  },

  async forgotPassword(email) {
    const user = db().users.find(
      (entry) => entry.email === email.trim().toLowerCase(),
    );
    if (user) issueToken(user.id);
    return { accepted: true as const };
  },

  async resetPassword(token, password) {
    const passwordError = validatePassword(password);
    if (passwordError) validationError(passwordError, { password: passwordError });
    const userId = consumeToken(token.trim());
    if (!userId) {
      fail(400, API_ERROR_CODES.VALIDATION_ERROR, "Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.");
    }
    const user = mustFindUser(db(), userId);
    user.password = password;
    // Reset revokes every session (4.3): sign the current user out.
    setCurrentUserId(null);
    return { accepted: true as const };
  },

  async updateProfile(input) {
    const user = requireAuth(viewer());
    if (input.full_name !== undefined) {
      const error = validateFullName(input.full_name);
      if (error) validationError(error, { full_name: error });
      user.full_name = input.full_name.trim();
    }
    if (input.phone !== undefined) {
      if (input.phone === null || input.phone.trim() === "") {
        user.phone = null;
      } else {
        const error = validatePhone(input.phone);
        if (error) validationError(error, { phone: error });
        user.phone = input.phone.trim();
      }
    }
    if (input.province_code !== undefined) user.province_code = input.province_code;
    if (input.default_address !== undefined) {
      user.default_address = (input.default_address ?? "").trim() || null;
    }
    const { password: _password, ...rest } = user;
    return rest;
  },

  async uploadAvatar(storagePath) {
    const user = requireAuth(viewer());
    const filename = decodeURIComponent(storagePath.split("/").at(-1) ?? "Avatar");
    user.avatar_url = avatarPlaceholder(filename);
    const { password: _password, ...rest } = user;
    return rest;
  },
};

export const categoriesApi: CategoriesApi = {
  async tree() {
    const categories = db().categories.filter((entry) => entry.status === "ACTIVE");
    const roots = categories.filter((entry) => entry.parent_id === null);
    return roots.map((root) => ({
      ...root,
      children: categories.filter((entry) => entry.parent_id === root.id),
    }));
  },
  async provinces(): Promise<Province[]> {
    return PROVINCES.map((entry) => ({ ...entry }));
  },
};

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 5 * 1024 * 1024;

export const uploadsApi: UploadsApi = {
  async upload(file, purpose) {
    requireActive(viewer());
    if (!ALLOWED_TYPES.includes(file.type)) {
      validationError("Chỉ chấp nhận ảnh JPG, PNG hoặc WebP.", {
        file: "Định dạng ảnh không được hỗ trợ.",
      });
    }
    if (file.size > MAX_BYTES) {
      validationError("Ảnh tối đa 5 MB.", { file: "Ảnh vượt quá 5 MB." });
    }
    // The mock has no storage bucket: fixtures always generate local SVGs so
    // the UI never depends on a remote image URL.
    const url =
      purpose === "avatar" ? avatarPlaceholder(file.name) : placeholderImage(file.name);
    return { url, storage_path: `users/mock/${purpose}/${encodeURIComponent(file.name)}` };
  },
};

export function currentViewer() {
  return viewer();
}

export function requireViewer() {
  return requireActive(viewer());
}
