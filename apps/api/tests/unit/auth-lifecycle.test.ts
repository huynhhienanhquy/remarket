import bcrypt from "bcryptjs";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
const client = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  session: { findUnique: vi.fn(), updateMany: vi.fn() },
  authToken: { findUnique: vi.fn(), updateMany: vi.fn() },
  outboxEvent: { createMany: vi.fn() },
  $queryRaw: vi.fn(), $executeRaw: vi.fn(), $transaction: vi.fn(),
}));
vi.mock("../../src/utils/prisma.js", () => ({ prisma: client }));
import { createApp } from "../../src/app.js";
import { env } from "../../src/config/env.js";
import { signAccessToken } from "../../src/shared/tokens.js";

const user = { id: "owner", fullName: "Test Owner", email: "owner@example.test", role: "USER", status: "ACTIVE", emailVerifiedAt: null, joinedAt: new Date(), avatarUrl: null, phone: null, provinceCode: null, defaultAddress: null, passwordHash: await bcrypt.hash("test-password-2026", 4) };
const cookie = `${env.refreshCookie}=opaque-test-token`;
const token = { id: "token", userId: user.id, sessionId: "session", purpose: "REFRESH", consumedAt: null, expiresAt: new Date(Date.now() + 60_000) };
beforeEach(() => {
  vi.resetAllMocks();
  client.user.findUnique.mockResolvedValue(user);
  client.session.findUnique.mockResolvedValue({ userId: user.id, revokedAt: null, expiresAt: token.expiresAt, user });
  client.authToken.findUnique.mockResolvedValue(token);
  client.session.updateMany.mockResolvedValue({ count: 1 });
  client.$queryRaw.mockResolvedValue([{ id: user.id }]);
  client.$executeRaw.mockResolvedValue(1);
  client.$transaction.mockImplementation((action: (tx: typeof client) => Promise<unknown>) => action(client));
});

describe("authentication lifecycle", () => {
  it("does not issue a session if reset changed the password during bcrypt", async () => {
    client.user.findUnique.mockResolvedValueOnce(user).mockResolvedValueOnce({ ...user, passwordHash: "changed" });
    await request(createApp()).post("/api/v1/auth/login").send({ email: user.email, password: "test-password-2026" }).expect(401);
    expect(client.$executeRaw).not.toHaveBeenCalled();
    expect(client.$queryRaw.mock.calls[0]![0].join("?")).toContain('FROM "User"');
  });
  it("returns the locked live identity, not pre-bcrypt permissions", async () => {
    client.user.findUnique.mockResolvedValueOnce(user).mockResolvedValueOnce({ ...user, status: "LOCKED" });
    const response = await request(createApp()).post("/api/v1/auth/login").send({ email: user.email, password: "test-password-2026" }).expect(200);
    expect(response.body.data.user.status).toBe("LOCKED");
    expect(response.body.data.user).not.toHaveProperty("passwordHash");
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.headers["set-cookie"]?.[0]).toContain("HttpOnly");
  });
  it("rejects bcrypt-truncated passwords before looking up a user", async () => {
    await request(createApp()).post("/api/v1/auth/login").send({ email: user.email, password: "a".repeat(73) }).expect(401);
    expect(client.user.findUnique).not.toHaveBeenCalled();
  });
  it.each(["https://evil.test", "http://localhost:5173/path", "http://localhost:5173/", "null"])("rejects invalid/untrusted Origin %s before writes", async (origin) => {
    await request(createApp()).post("/api/v1/auth/logout").set("Origin", origin).set("Cookie", cookie).expect(403);
    expect(client.$transaction).not.toHaveBeenCalled();
  });
  it("rejects an absent Origin in production before reading credentials", async () => {
    const previous = env.isProduction;
    Object.defineProperty(env, "isProduction", { value: true, configurable: true });
    try {
      await request(createApp()).post("/api/v1/auth/logout").set("Cookie", cookie).expect(403);
      expect(client.authToken.findUnique).not.toHaveBeenCalled();
    } finally { Object.defineProperty(env, "isProduction", { value: previous, configurable: true }); }
  });
  it("uses Secure/HttpOnly/SameSite and the same cookie path when secure mode is configured", async () => {
    const previous = env.cookieSecure;
    Object.defineProperty(env, "cookieSecure", { value: true, configurable: true });
    try {
      const response = await request(createApp()).post("/api/v1/auth/login").send({ email: user.email, password: "test-password-2026" }).expect(200);
      for (const attribute of ["Secure", "HttpOnly", "SameSite=Lax", "Path=/api/v1/auth"]) expect(response.headers["set-cookie"]?.[0]).toContain(attribute);
    } finally { Object.defineProperty(env, "cookieSecure", { value: previous, configurable: true }); }
  });
  it("logs out with a cookie even when the access token expired", async () => {
    const response = await request(createApp()).post("/api/v1/auth/logout").set("Origin", "http://localhost:5173").set("Cookie", cookie).set("Authorization", "Bearer expired").expect(200);
    expect(client.session.updateMany).toHaveBeenCalledWith({ where: { id: "session", userId: user.id, revokedAt: null }, data: { revokedAt: expect.any(Date) } });
    expect(client.authToken.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { sessionId: "session", purpose: "REFRESH", consumedAt: null } }));
    expect(client.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(client.session.updateMany.mock.invocationCallOrder[0]!);
    expect(response.headers["set-cookie"]?.[0]).toContain("Expires=Thu, 01 Jan 1970");
  });
  it("anonymous logout is idempotent and still clears the cookie", async () => {
    const response = await request(createApp()).post("/api/v1/auth/logout").expect(200);
    expect(client.$transaction).not.toHaveBeenCalled();
    expect(response.headers["set-cookie"]).toBeDefined();
  });
  it("does not revoke a different cookie session with a stale valid bearer", async () => {
    const response = await request(createApp()).post("/api/v1/auth/logout").set("Cookie", cookie).set("Authorization", `Bearer ${signAccessToken(user.id, "another-session")}`).expect(409);
    expect(response.body.error.code).toBe("SESSION_CHANGED");
    expect(response.headers["set-cookie"]).toBeUndefined();
    expect(client.$transaction).not.toHaveBeenCalled();
  });
  it("logout-all uses User before Session before AuthToken locks", async () => {
    await request(createApp()).post("/api/v1/auth/logout-all").set("Authorization", `Bearer ${signAccessToken(user.id, "session")}`).expect(200);
    expect(client.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(client.session.updateMany.mock.invocationCallOrder[0]!);
    expect(client.session.updateMany.mock.invocationCallOrder[0]).toBeLessThan(client.authToken.updateMany.mock.invocationCallOrder[0]!);
  });
  it("logout-all does not revoke a bearer account after the shared cookie switched sessions", async () => {
    client.authToken.findUnique.mockResolvedValue({ ...token, sessionId: "new-cookie-session" });
    await request(createApp()).post("/api/v1/auth/logout-all").set("Cookie", cookie).set("Authorization", `Bearer ${signAccessToken(user.id, "session")}`).expect(409);
    expect(client.$transaction).not.toHaveBeenCalled();
  });
  it("does not clear credentials when logout persistence fails", async () => {
    client.$transaction.mockRejectedValue(new Error("Persistence unavailable"));
    const response = await request(createApp()).post("/api/v1/auth/logout").set("Cookie", cookie).expect(500);
    expect(response.headers["set-cookie"]).toBeUndefined();
  });
});
