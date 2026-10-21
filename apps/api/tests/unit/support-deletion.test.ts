import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const client = vi.hoisted(() => ({
  session: { findUnique: vi.fn() }, user: { findUnique: vi.fn(), findMany: vi.fn() },
  supportTicket: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  supportMessage: { create: vi.fn(), findMany: vi.fn() },
  $transaction: vi.fn(), $queryRaw: vi.fn(),
}));
vi.mock("../../src/utils/prisma.js", () => ({ prisma: client }));
import { createApp } from "../../src/app.js";
import { signAccessToken } from "../../src/shared/tokens.js";

const now = new Date();
const owner = { id: "owner", fullName: "Private name", email: "owner@example.test", role: "USER", status: "ACTIVE", emailVerifiedAt: now, deletedAt: null };
const ticket = { id: "ticket", userId: owner.id, orderId: null, assignedAdminId: null, code: "TK-123456", type: "ACCOUNT", subject: "Old subject", status: "RESOLVED", createdAt: now, updatedAt: now, resolvedAt: now, closedAt: null, resolutionNote: null };
const authorization = `Bearer ${signAccessToken(owner.id, "session")}`;
beforeEach(() => {
  vi.resetAllMocks();
  client.session.findUnique.mockResolvedValue({ userId: owner.id, user: owner, expiresAt: new Date(Date.now() + 60_000), revokedAt: null });
  client.user.findUnique.mockResolvedValue({ ...owner, status: "LOCKED", deletedAt: now });
  client.$queryRaw.mockResolvedValue([]);
  client.$transaction.mockImplementation((callback: (tx: typeof client) => Promise<unknown>) => callback(client));
  client.supportTicket.findUnique.mockResolvedValue(ticket);
});

describe("support writes after account deletion", () => {
  it.each([
    ["/api/v1/support/tickets", { type: "ACCOUNT", subject: "Private subject", message: "Private content" }],
    ["/api/v1/support/tickets/ticket/messages", { message: "Private content" }],
    ["/api/v1/support/tickets/ticket/close", {}],
  ])("rechecks the account within the transaction for %s", async (path, payload) => {
    await request(createApp()).post(path as string).set("Authorization", authorization).send(payload).expect(401);
    expect(client.$queryRaw.mock.calls[0]![0].join("?")).toContain('FROM "User"');
    expect(client.$queryRaw.mock.calls[0]![0].join("?")).toContain("FOR SHARE");
    expect(client.supportTicket.create).not.toHaveBeenCalled();
    expect(client.supportTicket.update).not.toHaveBeenCalled();
    expect(client.supportMessage.create).not.toHaveBeenCalled();
    expect(client.supportTicket.findUnique).not.toHaveBeenCalled();
  });

  it("allows account support for a non-deleted locked user", async () => {
    const locked = { ...owner, status: "LOCKED" };
    client.session.findUnique.mockResolvedValue({ userId: owner.id, user: locked, expiresAt: new Date(Date.now() + 60_000), revokedAt: null });
    client.user.findUnique.mockResolvedValue(locked);
    client.supportTicket.create.mockResolvedValue({ ...ticket, status: "OPEN" });
    client.supportMessage.findMany.mockResolvedValue([]);
    await request(createApp()).post("/api/v1/support/tickets").set("Authorization", authorization)
      .send({ type: "ACCOUNT", subject: "Help with account", message: "Please review my account." }).expect(201);
    expect(client.supportMessage.create).toHaveBeenCalled();
  });
});
