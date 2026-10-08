import { z } from "zod";

/**
 * Fail-fast environment parsing (detail-project 18.1): the process refuses to
 * boot with a missing or weak secret instead of silently falling back to a
 * hard-coded value.
 */
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).optional(),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  DIRECT_URL: z.string().optional(),
  DATABASE_USE_DIRECT_URL: z.enum(["true", "false"]).default("false"),
  DATABASE_CONNECTION_LIMIT: z.coerce.number().int().min(1).max(50).default(5),
  DATABASE_TRANSACTION_TIMEOUT_MS: z.coerce.number().int().min(5_000).max(120_000).default(30_000),
  DATABASE_TRANSACTION_MAX_WAIT_MS: z.coerce.number().int().min(1_000).max(60_000).default(10_000),
  DATABASE_HEALTH_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(30_000).default(10_000),
  JWT_SIGNING_KEY: z.string().min(32).optional(),
  /** Backward-compatible alias used by the first implementation. */
  JWT_SECRET: z.string().min(32).optional(),
  JWT_ISSUER: z.string().trim().min(1).default("remarket"),
  JWT_AUDIENCE: z.string().trim().min(1).default("remarket-web"),
  JWT_ALGORITHM: z.enum(["HS256", "HS384", "HS512"]).default("HS256"),
  ACCESS_TOKEN_TTL: z.string().default("15m"),
  /** Refresh cookie lifetime in days (detail-project 5.2, max 7 days). */
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(7).default(7),
  /** Comma separated CORS allowlist — never a wildcard when credentials are on. */
  WEB_ORIGINS: z.string().optional(),
  FRONTEND_URL: z.string().optional(),
  PUBLIC_WEB_URL: z.string().url().default("http://localhost:5173"),
  BCRYPT_COST: z.coerce.number().int().min(10).max(14).default(12),
  ORDER_CONFIRM_TIMEOUT_HOURS: z.coerce.number().int().min(1).max(72).default(24),
  STORAGE_DRIVER: z.enum(["local", "supabase"]).default("local"),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().trim().min(1).optional(),
  STORAGE_BUCKET: z.string().trim().min(1).default("remarket-private"),
  STORAGE_SIGNED_URL_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(300),
  SMTP_HOST: z.string().trim().min(1).optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  EMAIL_FROM: z.string().email().optional(),
  /** Refresh cookies must be Secure outside local development. */
  COOKIE_SECURE: z
    .enum(["auto", "true", "false"])
    .default("auto"),
  RUN_JOBS: z.enum(["auto", "true", "false"]).default("auto"),
  WORKER_INTERVAL_MS: z.coerce.number().int().min(5_000).max(300_000).default(60_000),
  OUTBOX_INTERVAL_MS: z.coerce.number().int().min(250).max(60_000).default(1_000),
}).superRefine((value, ctx) => {
  if (value.DATABASE_USE_DIRECT_URL === "true" && !value.DIRECT_URL) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["DIRECT_URL"], message: "DIRECT_URL is required when DATABASE_USE_DIRECT_URL=true" });
  }
  if (!value.JWT_SIGNING_KEY && !value.JWT_SECRET) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["JWT_SIGNING_KEY"],
      message: "JWT_SIGNING_KEY (or legacy JWT_SECRET) is required",
    });
  }
  if (value.STORAGE_DRIVER === "supabase") {
    for (const field of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] as const) {
      if (!value[field]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message: `${field} is required when STORAGE_DRIVER=supabase`,
        });
      }
    }
  }
  if (value.NODE_ENV === "production") {
    for (const field of ["WEB_ORIGINS", "SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD", "EMAIL_FROM"] as const) {
      if (!value[field]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message: `${field} is required in production`,
        });
      }
    }
    if (value.COOKIE_SECURE === "false") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["COOKIE_SECURE"],
        message: "COOKIE_SECURE cannot be false in production",
      });
    }
    if (value.STORAGE_DRIVER !== "supabase") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["STORAGE_DRIVER"],
        message: "STORAGE_DRIVER must be supabase in production",
      });
    }
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(value.PUBLIC_WEB_URL)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["PUBLIC_WEB_URL"],
        message: "PUBLIC_WEB_URL must be the deployed web origin in production",
      });
    }
  }
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
  throw new Error(`Invalid environment:\n${issues}`);
}

const raw = parsed.data;

export const env = {
  nodeEnv: raw.NODE_ENV,
  isProduction: raw.NODE_ENV === "production",
  port: raw.PORT,
  trustProxyHops: raw.TRUST_PROXY_HOPS ?? (raw.NODE_ENV === "production" ? 1 : 0),
  databaseUrl: raw.DATABASE_URL,
  databaseRuntimeUrl: raw.DATABASE_USE_DIRECT_URL === "true" ? raw.DIRECT_URL! : raw.DATABASE_URL,
  databaseConnectionLimit: raw.DATABASE_CONNECTION_LIMIT,
  databaseTransactionTimeoutMs: raw.DATABASE_TRANSACTION_TIMEOUT_MS,
  databaseTransactionMaxWaitMs: raw.DATABASE_TRANSACTION_MAX_WAIT_MS,
  databaseHealthTimeoutMs: raw.DATABASE_HEALTH_TIMEOUT_MS,
  jwtSecret: raw.JWT_SIGNING_KEY ?? raw.JWT_SECRET!,
  jwtIssuer: raw.JWT_ISSUER,
  jwtAudience: raw.JWT_AUDIENCE,
  jwtAlgorithm: raw.JWT_ALGORITHM,
  accessTokenTtl: raw.ACCESS_TOKEN_TTL,
  refreshTtlDays: raw.REFRESH_TOKEN_TTL_DAYS,
  corsOrigins: (raw.WEB_ORIGINS ?? raw.FRONTEND_URL ?? "http://localhost:5173").split(",")
    .map((o) => o.trim())
    .filter(Boolean),
  publicWebUrl: raw.PUBLIC_WEB_URL.replace(/\/$/, ""),
  bcryptCost: raw.BCRYPT_COST,
  orderConfirmTimeoutHours: raw.ORDER_CONFIRM_TIMEOUT_HOURS,
  storage: {
    driver: raw.STORAGE_DRIVER,
    supabaseUrl: raw.SUPABASE_URL?.replace(/\/$/, "") ?? null,
    supabaseServiceRoleKey: raw.SUPABASE_SERVICE_ROLE_KEY ?? null,
    bucket: raw.STORAGE_BUCKET,
    signedUrlTtlSeconds: raw.STORAGE_SIGNED_URL_TTL_SECONDS,
  },
  smtp: raw.SMTP_HOST && raw.SMTP_USER && raw.SMTP_PASSWORD && raw.EMAIL_FROM
    ? {
        host: raw.SMTP_HOST,
        port: raw.SMTP_PORT,
        user: raw.SMTP_USER,
        password: raw.SMTP_PASSWORD,
        from: raw.EMAIL_FROM,
      }
    : null,
  cookieSecure: raw.COOKIE_SECURE === "auto" ? raw.NODE_ENV === "production" : raw.COOKIE_SECURE === "true",
  runJobs: raw.RUN_JOBS === "auto" ? raw.NODE_ENV !== "test" : raw.RUN_JOBS === "true",
  workerIntervalMs: raw.WORKER_INTERVAL_MS,
  outboxIntervalMs: raw.OUTBOX_INTERVAL_MS,
  /** Refresh cookie name shared by login/refresh/logout. */
  refreshCookie: "remarket_refresh",
} as const;
