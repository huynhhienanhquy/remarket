import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/utils/prisma.js";
import { sha256, signAccessToken, verifyAccessToken } from "../../src/shared/tokens.js";

const app = createApp();
const userIds: string[] = [];
const password = "test-password-auth-2026";
describe.skipIf(!process.env.TEST_DATABASE_URL)("PostgreSQL auth lifecycle", () => {
  afterAll(async () => {
    await prisma.outboxEvent.deleteMany({ where: { aggregateId: { in: userIds } } });
    const sessions = await prisma.session.findMany({ where: { userId: { in: userIds } }, select: { id: true } });
    await prisma.outboxEvent.deleteMany({ where: { aggregateId: { in: sessions.map((session) => session.id) } } });
    await prisma.authToken.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });
  async function account() {
    const id = randomUUID(); userIds.push(id);
    return prisma.user.create({ data: { id, email: `auth-${id}@example.test`, fullName: "Auth Test", passwordHash: await bcrypt.hash(password, 4) } });
  }
  async function login(email: string, supplied = password) {
    return request(app).post("/api/v1/auth/login").set("Origin", "http://localhost:5173").send({ email, password: supplied });
  }
  function cookie(response: { headers: Record<string, any> }) { return String(response.headers["set-cookie"][0]).split(";", 1)[0]!; }

  it("logout revokes its cookie session without a live JWT and remains idempotent", async () => {
    const user = await account(); const issued = await login(user.email);
    expect(issued.status).toBe(200);
    await request(app).post("/api/v1/auth/logout").set("Cookie", cookie(issued)).expect(200);
    await request(app).post("/api/v1/auth/logout").set("Cookie", cookie(issued)).expect(200);
    await request(app).get("/api/v1/auth/me").set("Authorization", `Bearer ${issued.body.data.access_token}`).expect(401);
    expect(await prisma.authToken.count({ where: { userId: user.id, consumedAt: null, purpose: "REFRESH" } })).toBe(0);
    const bootstrap = await request(app).post("/api/v1/auth/bootstrap").set("Cookie", cookie(issued)).expect(200);
    expect(bootstrap.body.data.user).toBeNull();
  });
  it("concurrent refresh/logout-all finishes without deadlock or surviving sessions", async () => {
    const user = await account(); const first = await login(user.email); const second = await login(user.email);
    const [refresh, logout] = await Promise.all([
      request(app).post("/api/v1/auth/refresh").set("Cookie", cookie(first)),
      request(app).post("/api/v1/auth/logout-all").set("Cookie", cookie(second)).set("Authorization", `Bearer ${second.body.data.access_token}`),
    ]);
    expect([200, 401]).toContain(refresh.status); expect(logout.status).toBe(200);
    expect(await prisma.session.count({ where: { userId: user.id, revokedAt: null } })).toBe(0);
    expect(await prisma.authToken.count({ where: { userId: user.id, purpose: "REFRESH", consumedAt: null } })).toBe(0);
    await request(app).get("/api/v1/auth/me").set("Authorization", `Bearer ${first.body.data.access_token}`).expect(401);
  });
  it("password reset consumes once, revokes every device and does not verify email", async () => {
    const user = await account(); const first = await login(user.email); await login(user.email);
    const raw = randomUUID(); const newPassword = "new-password-auth-2026";
    await prisma.authToken.create({ data: { userId: user.id, purpose: "RESET_PASSWORD", tokenHash: sha256(raw), expiresAt: new Date(Date.now() + 60_000) } });
    const results = await Promise.all([0, 1].map(() => request(app).post("/api/v1/auth/reset-password").send({ token: raw, password: newPassword })));
    expect(results.map((result) => result.status).sort()).toEqual([200, 422]);
    expect(await prisma.session.count({ where: { userId: user.id, revokedAt: null } })).toBe(0);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).emailVerifiedAt).toBeNull();
    await request(app).get("/api/v1/auth/me").set("Authorization", `Bearer ${first.body.data.access_token}`).expect(401);
    expect((await login(user.email)).status).toBe(401);
    expect((await login(user.email, newPassword)).status).toBe(200);
  });
  it("refresh issues current identity and replay revokes only that device", async () => {
    const user = await account(); const first = await login(user.email); const other = await login(user.email);
    const renewed = await request(app).post("/api/v1/auth/refresh").set("Cookie", cookie(first)).expect(200);
    expect(renewed.body.data.user.id).toBe(user.id);
    expect(cookie(renewed)).not.toBe(cookie(first));
    const firstId = verifyAccessToken(renewed.body.data.access_token)!.sessionId;
    await request(app).post("/api/v1/auth/refresh").set("Cookie", cookie(first)).expect(401);
    await request(app).get("/api/v1/auth/me").set("Authorization", `Bearer ${signAccessToken(user.id, firstId)}`).expect(401);
    await request(app).get("/api/v1/auth/me").set("Authorization", `Bearer ${other.body.data.access_token}`).expect(200);
    const event = await prisma.outboxEvent.findUniqueOrThrow({ where: { dedupeKey: `session-revoked:refresh-reuse:${firstId}` } });
    expect(event.payload).toEqual({ session_ids: [firstId] });
  });
});
