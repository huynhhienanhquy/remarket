import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/utils/prisma.js";
import { sha256, signAccessToken } from "../../src/shared/tokens.js";
import { requestEmailVerification } from "../../src/services/email-verification.js";

const app = createApp();
const ids: string[] = [];
async function account(role: "USER" | "ADMIN" = "USER") {
  const id = randomUUID(); ids.push(id);
  const user = await prisma.user.create({ data: { id, fullName: "Kiểm thử xác minh", email: `${id}@example.test`, passwordHash: "unused", role } });
  const session = await prisma.session.create({ data: { userId: id, expiresAt: new Date(Date.now() + 600_000) } });
  return { ...user, token: signAccessToken(id, session.id) };
}
describe.skipIf(!process.env.TEST_DATABASE_URL)("PostgreSQL admin email approval", () => {
  afterAll(async () => {
    await prisma.outboxEvent.deleteMany({ where: { aggregateId: { in: ids } } });
    await prisma.notification.deleteMany({ where: { OR: [{ userId: { in: ids } }, { referenceId: { in: ids } }] } });
    await prisma.auditLog.deleteMany({ where: { entityId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  });
  it("queues own requests, restricts approval and serializes concurrent retries", async () => {
    const user = await account(); const admin = await account("ADMIN");
    const send = () => request(app).post("/api/v1/auth/email-verification-request").set("Authorization", `Bearer ${user.token}`).send({});
    await request(app).post("/api/v1/auth/email-verification-request").send({}).expect(401);
    await request(app).post("/api/v1/auth/email-verification-request").set("Authorization", `Bearer ${user.token}`).send({ user_id: admin.id, email_verified_at: new Date().toISOString() }).expect(422);
    const [a, b] = await Promise.all([send().expect(200), send().expect(200)]);
    expect(a.body.data).toMatchObject({ id: user.id, status: "PENDING", approved_at: null });
    expect(a.body.data.requested_at).toBe(b.body.data.requested_at);
    expect(a.body.data).not.toHaveProperty("passwordHash");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).emailVerifiedAt).toBeNull();
    expect(await prisma.notification.count({ where: { userId: admin.id, referenceId: user.id, type: "EMAIL_VERIFICATION_REQUESTED" } })).toBe(1);
    await request(app).get("/api/v1/admin/email-verifications").set("Authorization", `Bearer ${user.token}`).expect(403);
    await request(app).post(`/api/v1/admin/email-verifications/${user.id}/approve`).set("Authorization", `Bearer ${user.token}`).send({}).expect(403);
    const pending = await request(app).get("/api/v1/admin/email-verifications").set("Authorization", `Bearer ${admin.token}`).expect(200);
    expect(pending.body.data.items.some((item: { id: string }) => item.id === user.id)).toBe(true);
    await request(app).post(`/api/v1/admin/email-verifications/${admin.id}/approve`).set("Authorization", `Bearer ${admin.token}`).send({}).expect(404);
    await request(app).post(`/api/v1/admin/email-verifications/${user.id}/approve`).set("Authorization", `Bearer ${admin.token}`).send({ role: "ADMIN" }).expect(422);
    const approve = () => request(app).post(`/api/v1/admin/email-verifications/${user.id}/approve`).set("Authorization", `Bearer ${admin.token}`).send({});
    const responses = await Promise.all([approve().expect(200), approve().expect(200)]);
    expect(responses[0].body.data.approved_at).toBe(responses[1].body.data.approved_at);
    expect(responses[0].body.data.status).toBe("APPROVED");
    expect(await prisma.auditLog.count({ where: { entityId: user.id, action: "user.email_verified" } })).toBe(1);
    expect(await prisma.notification.count({ where: { userId: user.id, type: "EMAIL_VERIFIED" } })).toBe(1);
    expect(await prisma.outboxEvent.count({ where: { aggregateId: user.id, eventType: "email.verified" } })).toBe(1);
    const me = await request(app).get("/api/v1/auth/me").set("Authorization", `Bearer ${user.token}`).expect(200);
    expect(me.body.data.email_verified_at).toBeTruthy();
    expect(me.body.data.role).toBe("USER");
    const approved = await request(app).get("/api/v1/admin/email-verifications?status=APPROVED").set("Authorization", `Bearer ${admin.token}`).expect(200);
    expect(approved.body.data.items.some((item: { id: string }) => item.id === user.id)).toBe(true);
  });
  it("valid legacy tokens submit requests instead of self-approving; locked users/admins cannot submit/approve", async () => {
    const user = await account(); const admin = await account("ADMIN"); const token = randomUUID();
    await prisma.authToken.create({ data: { userId: user.id, purpose: "VERIFY_EMAIL", tokenHash: sha256(token), expiresAt: new Date(Date.now() + 600_000) } });
    const response = await request(app).post("/api/v1/auth/verify-email").send({ token }).expect(200);
    expect(response.body.data.access_token).toBeTruthy();
    expect(response.headers["set-cookie"]).toBeTruthy();
    const queued = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(queued.emailVerifiedAt).toBeNull(); expect(queued.emailVerificationRequestedAt).toBeTruthy();
    await request(app).post("/api/v1/auth/verify-email").send({ token }).expect(422);
    await prisma.user.update({ where: { id: user.id }, data: { status: "LOCKED", lockReason: "test" } });
    await request(app).post("/api/v1/auth/email-verification-request").set("Authorization", `Bearer ${user.token}`).send({}).expect(403);
    await request(app).post(`/api/v1/admin/email-verifications/${user.id}/approve`).set("Authorization", `Bearer ${admin.token}`).send({}).expect(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).status).toBe("LOCKED");
    await prisma.user.update({ where: { id: admin.id }, data: { status: "LOCKED" } });
    await request(app).post(`/api/v1/admin/email-verifications/${user.id}/approve`).set("Authorization", `Bearer ${admin.token}`).send({}).expect(403);
  });
  it("rolls back the request, notification and audit together on transaction failure", async () => {
    const user = await account(); await account("ADMIN");
    await expect(prisma.$transaction(async (tx) => { await requestEmailVerification(tx, user.id); throw new Error("forced rollback"); })).rejects.toThrow("forced rollback");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).emailVerificationRequestedAt).toBeNull();
    expect(await prisma.notification.count({ where: { referenceId: user.id } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { entityId: user.id } })).toBe(0);
    expect(await prisma.outboxEvent.count({ where: { aggregateId: user.id } })).toBe(0);
  });
});
