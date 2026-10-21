import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import request from "supertest";
import { afterAll, describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/utils/prisma.js";
import { deliverMobilePush } from "../../src/jobs/push.js";
import { verifyAccessToken } from "../../src/shared/tokens.js";

const app = createApp();
const ids: string[] = [];
const password = "test-mobile-password-2026";
async function account() {
  const id = randomUUID();
  ids.push(id);
  return prisma.user.create({
    data: {
      id,
      email: `${id}@example.test`,
      fullName: "Mobile User",
      emailVerifiedAt: new Date(),
      passwordHash: await bcrypt.hash(password, 4),
    },
  });
}
async function login(email: string) {
  const response = await request(app)
    .post("/api/v1/auth/mobile/login")
    .send({ email, password })
    .expect(200);
  expect(response.headers["set-cookie"]).toBeUndefined();
  return response.body.data as { access_token: string; refresh_token: string };
}
describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "PostgreSQL native mobile",
  () => {
    afterAll(async () => {
      vi.unstubAllGlobals();
      const sessions = await prisma.session.findMany({
        where: { userId: { in: ids } },
        select: { id: true },
      });
      await prisma.outboxEvent.deleteMany({
        where: {
          aggregateId: { in: [...ids, ...sessions.map((row) => row.id)] },
        },
      });
      await prisma.conversation.deleteMany({
        where: { OR: [{ buyerId: { in: ids } }, { sellerId: { in: ids } }] },
      });
      await prisma.order.deleteMany({
        where: { OR: [{ buyerId: { in: ids } }, { sellerId: { in: ids } }] },
      });
      await prisma.user.deleteMany({ where: { id: { in: ids } } });
      await prisma.$disconnect();
    });
    it("separates browser/native refresh, preserves bootstrap, and revokes replay on the correct device", async () => {
      const user = await account();
      const mobile = await login(user.email);
      const web = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: user.email, password })
        .expect(200);
      const browserCookie = (
        web.headers["set-cookie"] as unknown as string[]
      )[0]!.split(";")[0]!;
      const sid = verifyAccessToken(mobile.access_token)!.sessionId;
      expect(
        (await prisma.session.findUniqueOrThrow({ where: { id: sid } }))
          .transport,
      ).toBe("MOBILE");
      await request(app)
        .post("/api/v1/auth/mobile/bootstrap")
        .send({ refresh_token: mobile.refresh_token })
        .expect(200);
      const rotated = await request(app)
        .post("/api/v1/auth/mobile/refresh")
        .send({ refresh_token: mobile.refresh_token })
        .expect(200);
      expect(rotated.body.data.refresh_token).not.toBe(mobile.refresh_token);
      await request(app)
        .post("/api/v1/auth/refresh")
        .set("Cookie", `remarket_refresh=${rotated.body.data.refresh_token}`)
        .expect(401);
      await request(app)
        .get("/api/v1/auth/me")
        .set("Authorization", `Bearer ${rotated.body.data.access_token}`)
        .expect(200);
      await request(app)
        .post("/api/v1/auth/mobile/refresh")
        .send({ refresh_token: mobile.refresh_token })
        .expect(401);
      await request(app)
        .get("/api/v1/auth/me")
        .set("Authorization", `Bearer ${rotated.body.data.access_token}`)
        .expect(401);
      await request(app)
        .post("/api/v1/auth/bootstrap")
        .set("Cookie", browserCookie)
        .expect(200);
    });
    it("enforces user block in the shared chat service and allows sending after unblock", async () => {
      const buyer = await account();
      const seller = await account();
      const buyerLogin = await login(buyer.email);
      const sellerLogin = await login(seller.email);
      const conversation = await prisma.conversation.create({
        data: { buyerId: buyer.id, sellerId: seller.id },
      });
      await request(app)
        .put(`/api/v1/mobile/blocks/${buyer.id}`)
        .set("Authorization", `Bearer ${sellerLogin.access_token}`)
        .expect(200);
      const path = `/api/v1/conversations/${conversation.id}/messages`;
      await request(app)
        .post(path)
        .set("Authorization", `Bearer ${buyerLogin.access_token}`)
        .send({ content: "Xin chào", client_message_id: randomUUID() })
        .expect(403);
      await request(app)
        .delete(`/api/v1/mobile/blocks/${buyer.id}`)
        .set("Authorization", `Bearer ${sellerLogin.access_token}`)
        .expect(200);
      await request(app)
        .post(path)
        .set("Authorization", `Bearer ${buyerLogin.access_token}`)
        .send({ content: "Xin chào", client_message_id: randomUUID() })
        .expect(201);
    });
    it("processes push tickets/receipts separately and disables registrations after session revocation", async () => {
      const user = await account();
      const native = await login(user.email);
      const installation = randomUUID();
      const token = `ExpoPushToken[${installation}]`;
      await request(app)
        .put("/api/v1/mobile/push-registration")
        .set("Authorization", `Bearer ${native.access_token}`)
        .send({ installation_id: installation, token, platform: "android" })
        .expect(200);
      const device = await prisma.pushRegistration.findUniqueOrThrow({
        where: { token },
      });
      await prisma.pushRegistration.update({
        where: { id: device.id },
        data: { createdAt: new Date(Date.now() - 60_000) },
      });
      const notification = await prisma.notification.create({
        data: {
          userId: user.id,
          type: "ORDER_CREATED",
          title: "Private title",
          content: "Private content",
          referenceType: "order",
          referenceId: randomUUID(),
        },
      });
      const oldFlag = process.env.MOBILE_PUSH_ENABLED;
      process.env.MOBILE_PUSH_ENABLED = "true";
      const mockedFetch = vi.fn(
        async (url: string, options: { body: string }) => {
          expect(url.startsWith("https://exp.host/--/api/v2/push/")).toBe(true);
          if (url.endsWith("/send")) {
            const sent = JSON.parse(options.body);
            expect(sent[0].body).not.toContain("Private");
            expect(sent[0].data.notification_id).toBe(notification.id);
            return new Response(
              JSON.stringify({ data: [{ status: "ok", id: "ticket-test" }] }),
            );
          }
          return new Response(
            JSON.stringify({ data: { "ticket-test": { status: "ok" } } }),
          );
        },
      );
      vi.stubGlobal("fetch", mockedFetch);
      try {
        await deliverMobilePush();
        const delivery = await prisma.pushDelivery.findUniqueOrThrow({
          where: {
            notificationId_registrationId: {
              notificationId: notification.id,
              registrationId: device.id,
            },
          },
        });
        expect(delivery.status).toBe("SENT");
        await prisma.pushDelivery.update({
          where: { id: delivery.id },
          data: { nextAttemptAt: new Date(Date.now() - 1_000) },
        });
        await deliverMobilePush();
        expect(
          (
            await prisma.pushDelivery.findUniqueOrThrow({
              where: { id: delivery.id },
            })
          ).status,
        ).toBe("DELIVERED");
        await request(app)
          .post("/api/v1/auth/mobile/logout")
          .send({ refresh_token: native.refresh_token })
          .expect(200);
        await deliverMobilePush();
        expect(
          (
            await prisma.pushRegistration.findUniqueOrThrow({
              where: { id: device.id },
            })
          ).enabled,
        ).toBe(false);
      } finally {
        process.env.MOBILE_PUSH_ENABLED = oldFlag;
        vi.unstubAllGlobals();
      }
    });
    it("deletes an eligible account only after password verification and revokes its session", async () => {
      const user = await account();
      const native = await login(user.email);
      await request(app)
        .post("/api/v1/mobile/delete-account")
        .set("Authorization", `Bearer ${native.access_token}`)
        .send({ password: "wrong-password" })
        .expect(422);
      expect(
        (await prisma.user.findUniqueOrThrow({ where: { id: user.id } }))
          .deletedAt,
      ).toBeNull();
      await request(app)
        .post("/api/v1/mobile/delete-account")
        .set("Authorization", `Bearer ${native.access_token}`)
        .send({ password })
        .expect(200);
      const deleted = await prisma.user.findUniqueOrThrow({
        where: { id: user.id },
      });
      expect(deleted.deletedAt).not.toBeNull();
      expect(deleted.email).not.toBe(user.email);
      await prisma.session.update({
        where: { id: verifyAccessToken(native.access_token)!.sessionId },
        data: { revokedAt: null },
      });
      await request(app)
        .get("/api/v1/auth/me")
        .set("Authorization", `Bearer ${native.access_token}`)
        .expect(401);
    });
    it("refuses account deletion while an order is still active without revoking the user's session", async () => {
      const buyer = await account();
      const seller = await account();
      const native = await login(buyer.email);
      await prisma.order.create({
        data: {
          code: `RM-MOBILE-${randomUUID()}`,
          buyerId: buyer.id,
          sellerId: seller.id,
          status: "PENDING",
          deliveryMethod: "MEETUP",
          subtotal: 100,
          shippingFee: 0,
          totalAmount: 100,
          expiresAt: new Date(Date.now() + 3_600_000),
        },
      });
      const response = await request(app)
        .post("/api/v1/mobile/delete-account")
        .set("Authorization", `Bearer ${native.access_token}`)
        .send({ password })
        .expect(409);
      expect(response.body.error.code).toBe("ACCOUNT_DELETION_PENDING");
      expect(
        (await prisma.user.findUniqueOrThrow({ where: { id: buyer.id } }))
          .deletedAt,
      ).toBeNull();
      await request(app)
        .get("/api/v1/auth/me")
        .set("Authorization", `Bearer ${native.access_token}`)
        .expect(200);
    });
  },
);
