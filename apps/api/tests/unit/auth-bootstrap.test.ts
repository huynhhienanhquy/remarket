import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const client = vi.hoisted(() => ({
  authToken: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn() },
  session: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  user: { findUnique: vi.fn() },
  outboxEvent: { createMany: vi.fn() },
  $queryRaw: vi.fn(), $executeRaw: vi.fn(), $transaction: vi.fn(),
}));
vi.mock("../../src/utils/prisma.js", () => ({ prisma: client }));
import { createApp } from "../../src/app.js";
import { env } from "../../src/config/env.js";
import { sha256 } from "../../src/shared/tokens.js";

const expiresAt = new Date(Date.now() + 60_000);
const user = { id: "user", fullName: "Admin Test", email: "admin@example.test", role: "ADMIN", status: "ACTIVE", emailVerifiedAt: new Date(), joinedAt: new Date(), avatarUrl: null, phone: null, provinceCode: null, defaultAddress: null };
const cookie = `${env.refreshCookie}=opaque-test-token`;
const token = { id: "token", userId: user.id, sessionId: "session", purpose: "REFRESH", consumedAt: null, expiresAt };
function lockedRow(record = token) {
  return { ...user, lockedSessionId: "session", sessionUserId: user.id,
    refreshHash: sha256("opaque-test-token"), revokedAt: null, sessionExpiresAt: expiresAt,
    tokenId: record.id, tokenUserId: record.userId, tokenSessionId: record.sessionId,
    purpose: record.purpose, consumedAt: record.consumedAt, tokenExpiresAt: record.expiresAt };
}
beforeEach(() => {
  vi.resetAllMocks();
  client.authToken.findUnique.mockResolvedValue(token);
  client.session.findUnique.mockResolvedValue({ id: "session", userId: user.id, expiresAt, revokedAt: null, refreshHash: sha256("opaque-test-token") });
  client.user.findUnique.mockResolvedValue(user);
  client.$executeRaw.mockResolvedValue(1);
  client.$queryRaw.mockImplementation(async (query: TemplateStringsArray) => {
    const sql = query.join("?");
    if (sql.includes("WITH locked_user")) return [lockedRow(await client.authToken.findUnique())];
    return [];
  });
  client.$transaction.mockImplementation((fn: (tx: typeof client) => Promise<unknown>) => fn(client));
});

describe("cookie session discovery", () => {
  it("returns a successful guest session without hitting persistence", async () => {
    const response = await request(createApp()).post("/api/v1/auth/bootstrap").set("Origin", "http://localhost:5173").expect(200);
    expect(response.body.data).toEqual({ user: null, access_token: null });
    expect(client.authToken.findUnique).not.toHaveBeenCalled();
    await request(createApp()).post("/api/v1/auth/refresh").expect(401);
  });
  it("rejects an untrusted Origin before touching cookies or persistence", async () => {
    await request(createApp()).post("/api/v1/auth/bootstrap").set("Origin", "https://untrusted.example").set("Cookie", cookie).expect(403);
    expect(client.$transaction).not.toHaveBeenCalled();
  });
  it("discovers the server role and access token without consuming the browser cookie", async () => {
    const response = await request(createApp()).post("/api/v1/auth/bootstrap").set("Cookie", cookie).expect(200);
    expect(response.body.data.user).toMatchObject({ id: user.id, role: "ADMIN", status: "ACTIVE" });
    expect(response.body.data.access_token).toBeTypeOf("string");
    expect(response.headers["set-cookie"]).toBeUndefined();
    expect(client.$executeRaw).not.toHaveBeenCalled();
    expect(client.$queryRaw).toHaveBeenCalledTimes(1);
    const sql = client.$queryRaw.mock.calls[0]![0].join("?");
    expect(sql).toContain('FROM "User"');
    expect(sql).toContain('CROSS JOIN locked_user');
    expect(sql).toContain('CROSS JOIN locked_session');
    expect(sql.match(/FOR UPDATE/g)).toHaveLength(3);
    await request(createApp()).post("/api/v1/auth/bootstrap").set("Cookie", cookie).expect(200);
    expect(client.$executeRaw).not.toHaveBeenCalled();
    expect(client.authToken.update).not.toHaveBeenCalled();
  });
  it("uses the profile and state returned by the locks without reading them again", async () => {
    client.user.findUnique.mockRejectedValue(new Error("Unexpected duplicate user read"));
    client.session.findUnique.mockRejectedValue(new Error("Unexpected duplicate session read"));
    client.$queryRaw.mockReset().mockResolvedValueOnce([lockedRow()]);
    const response = await request(createApp()).post("/api/v1/auth/bootstrap").set("Cookie", cookie).expect(200);
    expect(response.body.data.user.role).toBe("ADMIN");
    expect(client.user.findUnique).not.toHaveBeenCalled();
    expect(client.session.findUnique).not.toHaveBeenCalled();
    expect(client.authToken.findUnique).toHaveBeenCalledTimes(1);
  });
  it.each([null, { ...token, expiresAt: new Date(0) }])("returns guest for unknown or expired cookies", async (record) => {
    client.authToken.findUnique.mockResolvedValue(record);
    const response = await request(createApp()).post("/api/v1/auth/bootstrap").set("Cookie", cookie).expect(200);
    expect(response.body.data.user).toBeNull();
    expect(client.$executeRaw).not.toHaveBeenCalled();
  });
  it("still revokes the session if a consumed cookie is replayed", async () => {
    client.authToken.findUnique.mockResolvedValue({ ...token, consumedAt: new Date() });
    const response = await request(createApp()).post("/api/v1/auth/bootstrap").set("Cookie", cookie).expect(200);
    expect(response.body.data.user).toBeNull();
    expect(client.session.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { revokedAt: expect.any(Date) } }));
    expect(client.$executeRaw).not.toHaveBeenCalled();
  });
  it("does not clear cookies or report a guest on a database timeout", async () => {
    client.$transaction.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("Timed out", { code: "P2028", clientVersion: "5.22.0" }));
    const response = await request(createApp()).post("/api/v1/auth/bootstrap").set("Cookie", cookie).expect(409);
    expect(response.body.error.code).toBe("RETRY_LATER");
    expect(response.headers["set-cookie"]).toBeUndefined();
  });
  it("does not deliver a replacement cookie when the atomic writes fail", async () => {
    client.$executeRaw.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("Conflict", { code: "P2002", clientVersion: "5.22.0" }));
    const response = await request(createApp()).post("/api/v1/auth/refresh").set("Cookie", cookie);
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.headers["set-cookie"]).toBeUndefined();
  });
  it("refresh returns the server identity, consumes once, and issues a protected cookie", async () => {
    const response = await request(createApp()).post("/api/v1/auth/refresh").set("Cookie", cookie).expect(200);
    expect(response.body.data.user).toMatchObject({ id: user.id, role: "ADMIN" });
    expect(response.body.data.access_token).toBeTypeOf("string");
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.headers["set-cookie"]?.[0]).toContain("HttpOnly");
    expect(client.$executeRaw).toHaveBeenCalledTimes(1);
  });
  it("does not revoke a current session for an expired consumed credential", async () => {
    client.authToken.findUnique.mockResolvedValue({ ...token, consumedAt: new Date(), expiresAt: new Date(0) });
    await request(createApp()).post("/api/v1/auth/bootstrap").set("Cookie", cookie).expect(200);
    expect(client.session.updateMany).not.toHaveBeenCalled();
    expect(client.outboxEvent.createMany).not.toHaveBeenCalled();
  });
  it("replay revokes only the affected session, not other devices of the same user", async () => {
    client.authToken.findUnique.mockResolvedValue({ ...token, consumedAt: new Date() });
    await request(createApp()).post("/api/v1/auth/bootstrap").set("Cookie", cookie).expect(200);
    const payload = client.outboxEvent.createMany.mock.calls[0]![0].data[0].payload;
    expect(payload).toEqual({ session_ids: ["session"] });
  });
});
