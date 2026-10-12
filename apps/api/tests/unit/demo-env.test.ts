import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  for (const field of ["SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD", "EMAIL_FROM", "WEB_ORIGINS", "PUBLIC_WEB_URL", "JWT_SECRET", "FRONTEND_URL"]) vi.stubEnv(field, undefined);
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("DATABASE_URL", "postgresql://test:test@localhost/test");
  vi.stubEnv("JWT_SIGNING_KEY", "test-only-key-at-least-thirty-two-characters");
  vi.stubEnv("SERVE_WEB", "true");
  vi.stubEnv("RENDER_EXTERNAL_URL", "https://remarket-demo.onrender.com");
  vi.stubEnv("EMAIL_ENABLED", "false");
  vi.stubEnv("COOKIE_SECURE", "true");
  vi.stubEnv("STORAGE_DRIVER", "supabase");
  vi.stubEnv("SUPABASE_URL", "https://storage.example.test");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-only-key");
});
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

describe("Render demo environment", () => {
  it("uses Render's HTTPS origin without requiring SMTP when email is explicitly disabled", async () => {
    const { env } = await import("../../src/config/env.js");
    expect(env.publicWebUrl).toBe("https://remarket-demo.onrender.com");
    expect(env.corsOrigins).toEqual([env.publicWebUrl]);
    expect(env.emailEnabled).toBe(false);
    expect(env.cookieSecure).toBe(true);
  });
  it("keeps SMTP required by default", async () => {
    vi.stubEnv("EMAIL_ENABLED", undefined);
    await expect(import("../../src/config/env.js")).rejects.toThrow("SMTP_HOST is required");
  });
  it.each([["COOKIE_SECURE", "false", "COOKIE_SECURE cannot be false"], ["STORAGE_DRIVER", "local", "STORAGE_DRIVER must be supabase"]])("preserves production safeguards for %s", async (key, value, message) => {
    vi.stubEnv(key, value);
    await expect(import("../../src/config/env.js")).rejects.toThrow(message);
  });
  it("honors explicit origins instead of extending the allowlist", async () => {
    vi.stubEnv("PUBLIC_WEB_URL", "https://demo.example.test");
    vi.stubEnv("WEB_ORIGINS", "https://demo.example.test");
    const { env } = await import("../../src/config/env.js");
    expect(env.corsOrigins).toEqual(["https://demo.example.test"]);
  });
});
