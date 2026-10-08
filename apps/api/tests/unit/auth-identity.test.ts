import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const client = vi.hoisted(() => ({
  session: { findUnique: vi.fn() },
  user: { findUnique: vi.fn() },
}));
vi.mock("../../src/utils/prisma.js", () => ({ prisma: client }));
import { createApp } from "../../src/app.js";
import { signAccessToken } from "../../src/shared/tokens.js";

const user = {
  id: "user", fullName: "Identity Test", email: "identity@example.test",
  role: "ADMIN", status: "ACTIVE", emailVerifiedAt: null, joinedAt: new Date(),
  avatarUrl: null, phone: null, provinceCode: null, defaultAddress: null,
};
const session = { userId: user.id, revokedAt: null, expiresAt: new Date(Date.now() + 60_000), user };
const access = `Bearer ${signAccessToken(user.id, "session")}`;
beforeEach(() => { vi.resetAllMocks(); client.session.findUnique.mockResolvedValue(session); });

describe("fresh identity with one joined read", () => {
  it("reuses the middleware's profile for me without a duplicate user read", async () => {
    const response = await request(createApp()).get("/api/v1/auth/me").set("Authorization", access).expect(200);
    expect(response.body.data).toMatchObject({ id: user.id, role: "ADMIN" });
    expect(response.body.data).not.toHaveProperty("passwordHash");
    expect(client.session.findUnique).toHaveBeenCalledTimes(1);
    expect(client.user.findUnique).not.toHaveBeenCalled();
  });
  it("reads a changed role/status afresh on the next request", async () => {
    const app = createApp();
    await request(app).get("/api/v1/auth/me").set("Authorization", access).expect(200);
    client.session.findUnique.mockResolvedValue({ ...session, user: { ...user, role: "USER", status: "LOCKED" } });
    const response = await request(app).get("/api/v1/auth/me").set("Authorization", access).expect(200);
    expect(response.body.data).toMatchObject({ role: "USER", status: "LOCKED" });
    expect(client.session.findUnique).toHaveBeenCalledTimes(2);
    await request(app).get("/api/v1/admin/categories").set("Authorization", access).expect(403);
  });
  it.each([
    null,
    { ...session, revokedAt: new Date() },
    { ...session, expiresAt: new Date(0) },
    { ...session, userId: "another-user" },
  ])("still rejects missing, revoked, expired or mismatched sessions", async (record) => {
    client.session.findUnique.mockResolvedValue(record);
    await request(createApp()).get("/api/v1/auth/me").set("Authorization", access).expect(401);
    expect(client.user.findUnique).not.toHaveBeenCalled();
  });
});
