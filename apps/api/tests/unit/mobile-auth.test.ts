import bcrypt from "bcryptjs";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
const client = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  session: { findUnique: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
  authToken: { findUnique: vi.fn(), updateMany: vi.fn() },
  outboxEvent: { createMany: vi.fn() },
  outboxDedupeKey: { createManyAndReturn: vi.fn() },
  $queryRaw: vi.fn(),
  $executeRaw: vi.fn(),
  $transaction: vi.fn(),
}));
vi.mock("../../src/utils/prisma.js", () => ({ prisma: client }));
import { createApp } from "../../src/app.js";
import { env } from "../../src/config/env.js";
import { sha256 } from "../../src/shared/tokens.js";
const raw = "a".repeat(43);
const expiresAt = new Date(Date.now() + 60_000);
const user = {
  id: "native-owner",
  fullName: "Native Owner",
  email: "native@example.test",
  role: "USER",
  status: "ACTIVE",
  emailVerifiedAt: null,
  joinedAt: new Date(),
  avatarUrl: null,
  phone: null,
  provinceCode: null,
  defaultAddress: null,
  passwordHash: await bcrypt.hash("native-password-2026", 4),
};
const token = {
  id: "token",
  userId: user.id,
  sessionId: "session",
  purpose: "REFRESH",
  consumedAt: null,
  expiresAt,
};
const row = {
  ...user,
  transport: "MOBILE",
  lockedSessionId: "session",
  sessionUserId: user.id,
  refreshHash: sha256(raw),
  revokedAt: null,
  sessionExpiresAt: expiresAt,
  tokenId: token.id,
  tokenUserId: user.id,
  tokenSessionId: "session",
  purpose: "REFRESH",
  consumedAt: null,
  tokenExpiresAt: expiresAt,
};
beforeEach(() => {
  vi.resetAllMocks();
  client.user.findUnique.mockResolvedValue(user);
  client.authToken.findUnique.mockResolvedValue(token);
  client.$queryRaw.mockResolvedValue([row]);
  client.$executeRaw.mockResolvedValue(1);
  client.$transaction.mockImplementation((fn) => fn(client));
  client.outboxDedupeKey.createManyAndReturn.mockImplementation(
    async ({ data }) => data,
  );
});
describe("native session transport", () => {
  it("accepts the same case-sensitive password through web and mobile login", async () => {
    const app = createApp();
    const credentials = { email: user.email, password: "native-password-2026" };
    for (const transport of ["", "/mobile"]) {
      const response = await request(app)
        .post(`/api/v1/auth${transport}/login`)
        .send(credentials)
        .expect(200);
      expect(response.body.data.user.id).toBe(user.id);
      await request(app)
        .post(`/api/v1/auth${transport}/login`)
        .send({ ...credentials, password: "Native-password-2026" })
        .expect(401);
    }
  });

  it("issues native credentials in production without Origin or a cookie", async () => {
    const previous = env.isProduction;
    Object.defineProperty(env, "isProduction", {
      value: true,
      configurable: true,
    });
    try {
      const response = await request(createApp())
        .post("/api/v1/auth/mobile/login")
        .send({ email: user.email, password: "native-password-2026" })
        .expect(200);
      expect(response.body.data.refresh_token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(response.headers["set-cookie"]).toBeUndefined();
      expect(response.headers["cache-control"]).toBe("no-store");
      expect(client.$executeRaw.mock.calls[0]).toContain("MOBILE");
    } finally {
      Object.defineProperty(env, "isProduction", {
        value: previous,
        configurable: true,
      });
    }
  });
  it.each(["Origin", "Cookie"])(
    "rejects browser ambient %s before touching credentials",
    async (header) => {
      await request(createApp())
        .post("/api/v1/auth/mobile/login")
        .set(
          header,
          header === "Origin"
            ? "http://localhost:5173"
            : "remarket_refresh=secret",
        )
        .send({ email: user.email, password: "native-password-2026" })
        .expect(403);
      expect(client.user.findUnique).not.toHaveBeenCalled();
    },
  );
  it("bootstrap validates without rotating or returning a new refresh token", async () => {
    const response = await request(createApp())
      .post("/api/v1/auth/mobile/bootstrap")
      .send({ refresh_token: raw })
      .expect(200);
    expect(response.body.data.user.id).toBe(user.id);
    expect(response.body.data.refresh_token).toBeUndefined();
    expect(client.$executeRaw).not.toHaveBeenCalled();
  });
  it("rotates a mobile credential without issuing Set-Cookie", async () => {
    const response = await request(createApp())
      .post("/api/v1/auth/mobile/refresh")
      .send({ refresh_token: raw })
      .expect(200);
    expect(response.body.data.refresh_token).not.toBe(raw);
    expect(response.headers["set-cookie"]).toBeUndefined();
    expect(client.$executeRaw).toHaveBeenCalledTimes(1);
  });
  it("cannot exchange a web refresh token through the mobile transport", async () => {
    client.$queryRaw.mockResolvedValue([{ ...row, transport: "WEB" }]);
    await request(createApp())
      .post("/api/v1/auth/mobile/refresh")
      .send({ refresh_token: raw })
      .expect(401);
    expect(client.$executeRaw).not.toHaveBeenCalled();
    expect(client.session.updateMany).not.toHaveBeenCalled();
  });
  it("cannot exchange a mobile credential through web cookies", async () => {
    await request(createApp())
      .post("/api/v1/auth/refresh")
      .set("Cookie", `${env.refreshCookie}=${raw}`)
      .expect(401);
    expect(client.$executeRaw).not.toHaveBeenCalled();
  });
  it("rejects extra fields in refresh requests", async () => {
    await request(createApp())
      .post("/api/v1/auth/mobile/refresh")
      .send({ refresh_token: raw, role: "ADMIN" })
      .expect(422);
    expect(client.authToken.findUnique).not.toHaveBeenCalled();
  });
});
