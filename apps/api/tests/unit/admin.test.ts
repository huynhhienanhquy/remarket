import type { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const client = vi.hoisted(() => ({
  user: { count: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
  session: { findUnique: vi.fn() },
  product: { count: vi.fn(), groupBy: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() },
  notification: { createMany: vi.fn() },
  order: { count: vi.fn(), aggregate: vi.fn() },
  report: { count: vi.fn() },
  supportTicket: { count: vi.fn(), findMany: vi.fn() },
  category: { count: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  auditLog: { findMany: vi.fn(), create: vi.fn() },
  $queryRaw: vi.fn(),
  $transaction: vi.fn(),
}));
vi.mock("../../src/utils/prisma.js", () => ({ prisma: client }));
import { createApp } from "../../src/app.js";
import { signAccessToken } from "../../src/shared/tokens.js";
import { adminDateRange } from "../../src/shared/admin-helpers.js";
import { bootstrapFirstAdmin } from "../../src/services/bootstrap-admin.js";

const admin = { id: "operator", email: "admin@example.com", fullName: "Admin Test", role: "ADMIN", status: "ACTIVE", emailVerifiedAt: new Date() };
const authorization = () => "Bearer " + signAccessToken(admin.id, "session");
const category = { id: "root", name: "Điện tử", slug: "dien-tu", parentId: null, status: "INACTIVE", children: [] };
const bootstrapInput = { email: " NEW@example.com ", full_name: " Admin First ", password: "Operator-password-2026" };

beforeEach(() => {
  vi.resetAllMocks();
  client.user.findUnique.mockResolvedValue(admin);
  client.session.findUnique.mockImplementation(async () => ({ userId: admin.id, revokedAt: null, expiresAt: new Date(Date.now() + 60_000), user: await client.user.findUnique() }));
  client.$transaction.mockImplementation((fn: (tx: typeof client) => Promise<unknown>) => fn(client));
  client.$queryRaw.mockResolvedValue([]);
});

describe("admin date bounds", () => {
  it("includes the whole Vietnam calendar day, not just UTC midnight", () => {
    const range = adminDateRange("2026-10-07", "2026-10-07");
    expect(range).toEqual({ gte: new Date("2026-10-06T17:00:00.000Z"), lte: new Date("2026-10-07T16:59:59.999Z") });
    expect(adminDateRange(undefined, undefined)).toBeUndefined();
  });
  it.each([["2026-02-30", undefined], ["2026-10-08", "2026-10-07"], ["2026-10-07T00:00:00Z", undefined]])("rejects invalid range %s / %s", (from, to) => {
    expect(() => adminDateRange(from, to)).toThrow();
  });
});

describe("admin HTTP contracts with isolated persistence", () => {
  const leaf = { id: "leaf", name: "Danh mục", parentId: null, parent: null, status: "ACTIVE", _count: { children: 0 } };
  const pending = {
    id: "listing", sellerId: "seller", seller: { ...admin, id: "seller", role: "USER", avatarUrl: null, provinceCode: null, joinedAt: new Date() },
    title: "Tin kiểm thử", description: "Chi tiết tin", price: 100000n, shippingFee: 0n,
    categoryId: leaf.id, category: leaf, deletedAt: null, status: "PENDING", isBlocked: false,
    version: 1, images: [], publishedAt: null, createdAt: new Date(), updatedAt: new Date(),
    blockReason: null, rejectionReason: null, condition: "GOOD", usageMonths: null,
    provinceCode: "79", deliveryMethod: "COD",
  };
  it("approves a fresh pending version with an audit and seller notification", async () => {
    client.product.findUnique.mockResolvedValueOnce(pending).mockResolvedValueOnce(pending).mockResolvedValueOnce({ ...pending, version: 2, status: "ACTIVE" });
    client.product.updateMany.mockResolvedValue({ count: 1 });
    client.category.findUnique.mockResolvedValue(leaf);
    const response = await request(createApp()).post("/api/v1/admin/products/listing/approve").set("Authorization", authorization()).send({ expected_version: 1 }).expect(200);
    expect(response.body.data).toMatchObject({ status: "ACTIVE", version: 2 });
    expect(client.notification.createMany).toHaveBeenCalledWith(expect.objectContaining({ data: [expect.objectContaining({ type: "PRODUCT_APPROVED", userId: "seller" })] }));
    expect(client.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "product.approve", entityId: "listing" }) }));
  });
  it("returns VERSION_CONFLICT when a listing has already been approved, without replaying writes", async () => {
    client.product.findUnique.mockResolvedValue({ ...pending, version: 2, status: "ACTIVE" });
    const response = await request(createApp()).post("/api/v1/admin/products/listing/approve").set("Authorization", authorization()).send({ expected_version: 1 }).expect(409);
    expect(response.body.error.code).toBe("VERSION_CONFLICT");
    expect(client.product.updateMany).not.toHaveBeenCalled();
    expect(client.notification.createMany).not.toHaveBeenCalled();
  });
  it("rejects approving a blocked listing even when the version is current", async () => {
    client.product.findUnique.mockResolvedValue({ ...pending, isBlocked: true });
    const response = await request(createApp()).post("/api/v1/admin/products/listing/approve").set("Authorization", authorization()).send({ expected_version: 1 }).expect(409);
    expect(response.body.error.code).toBe("INVALID_ORDER_TRANSITION");
    expect(client.product.updateMany).not.toHaveBeenCalled();
  });
  it("returns all lifecycle counts, pending tickets and exact completed transaction value", async () => {
    client.$queryRaw.mockResolvedValueOnce([{
      total_users: 20n, new_users_in_period: 2n, pending: 3n, active: 0n,
      rejected: 0n, reserved: 0n, sold: 8n, inactive: 0n, blocked_products: 1n,
      completed_orders_in_period: 4n, completed_order_value_in_period: "9007199254740993",
      pending_reports: 5n, unresolved_tickets: 6n,
    }]);
    client.product.findMany.mockResolvedValue([]);
    client.supportTicket.findMany.mockResolvedValue([]);
    const response = await request(createApp()).get("/api/v1/admin/dashboard?from=2026-10-07&to=2026-10-07").set("Authorization", authorization()).expect(200);
    expect(response.body.data).toMatchObject({
      total_users: 20, new_users_in_period: 2, completed_orders_in_period: 4,
      completed_order_value_in_period: "9007199254740993", pending_reports: 5, unresolved_tickets: 6, blocked_products: 1,
      products_by_status: { PENDING: 3, ACTIVE: 0, REJECTED: 0, RESERVED: 0, SOLD: 8, INACTIVE: 0 },
    });
    const [sql, from, to] = client.$queryRaw.mock.calls[0]!;
    expect((sql as TemplateStringsArray).join("?")).toContain('WHERE "deletedAt" IS NULL');
    expect((sql as TemplateStringsArray).join("?")).toContain("'OPEN', 'IN_PROGRESS'");
    expect({ gte: from, lte: to }).toEqual(adminDateRange("2026-10-07", "2026-10-07"));
    expect(client.$queryRaw).toHaveBeenCalledTimes(1);
    expect(client.user.count).not.toHaveBeenCalled();
  });
  it("pages inactive category groups using action date and actor filters", async () => {
    client.category.findMany.mockResolvedValue([category]);
    client.category.count.mockResolvedValue(21);
    client.auditLog.findMany.mockResolvedValue([{ entityId: "root" }]);
    const response = await request(createApp()).get("/api/v1/admin/categories?status=INACTIVE&handled_by=operator&from=2026-10-07&to=2026-10-07&page=2&page_size=10").set("Authorization", authorization()).expect(200);
    expect(response.body.data).toMatchObject({ items: [{ id: "root", status: "INACTIVE" }], meta: { page: 2, page_size: 10, total: 21, total_pages: 3 } });
    expect(client.category.findMany).toHaveBeenCalledWith(expect.objectContaining({
      skip: 10, take: 10, where: { parentId: null, OR: [{ status: "INACTIVE", id: { in: ["root"] } }, { children: { some: { status: "INACTIVE", id: { in: ["root"] } } } }] },
    }));
    expect(client.auditLog.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { entityType: "category", actorType: "ADMIN", actorId: "operator", createdAt: adminDateRange("2026-10-07", "2026-10-07") } }));
  });
  it("provides the complete editor tree without an ACTIVE-only restriction", async () => {
    client.category.findMany.mockResolvedValue([category]);
    const response = await request(createApp()).get("/api/v1/admin/categories/tree").set("Authorization", authorization()).expect(200);
    expect(response.body.data[0].status).toBe("INACTIVE");
    expect(client.category.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { parentId: null } }));
  });
  it("does not build an empty OR filter when listing unfiltered category roots", async () => {
    client.category.findMany.mockResolvedValue([category]);
    client.category.count.mockResolvedValue(1);
    await request(createApp()).get("/api/v1/admin/categories").set("Authorization", authorization()).expect(200);
    expect(client.category.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { parentId: null } }));
  });
  it("writes category mutations and their admin audit in the same transaction", async () => {
    client.category.findUnique.mockResolvedValue(null);
    client.category.create.mockResolvedValue({ ...category, status: "ACTIVE" });
    await request(createApp()).post("/api/v1/admin/categories").set("Authorization", authorization()).send({ name: "Điện tử", slug: "dien-tu" }).expect(201);
    expect(client.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ actorId: admin.id, actorType: "ADMIN", action: "category.create", entityType: "category", entityId: "root" }) }));
    expect(client.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable" });
  });
  it.each(["ACTIVE", "LOCKED"])("never allows a USER account into admin, status %s", async (status) => {
    client.user.findUnique.mockResolvedValue({ ...admin, role: "USER", status });
    await request(createApp()).get("/api/v1/admin/categories/tree").set("Authorization", authorization()).expect(403);
    expect(client.category.findMany).not.toHaveBeenCalled();
  });
  it("rejects locked admins and unauthenticated requests", async () => {
    client.user.findUnique.mockResolvedValue({ ...admin, status: "LOCKED" });
    const locked = await request(createApp()).get("/api/v1/admin/categories/tree").set("Authorization", authorization()).expect(403);
    expect(locked.body.error.code).toBe("ACCOUNT_LOCKED");
    await request(createApp()).get("/api/v1/admin/categories/tree").expect(401);
    expect(client.category.findMany).not.toHaveBeenCalled();
  });
  it.each([{ role: "ADMIN" }, { status: "ACTIVE" }])("rejects profile privilege injection %o without writing", async (payload) => {
    const response = await request(createApp()).patch("/api/v1/auth/profile").set("Authorization", authorization()).send({ full_name: "Valid Name", ...payload }).expect(422);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(client.$transaction).not.toHaveBeenCalled();
    expect(client.user.update).not.toHaveBeenCalled();
  });
  it("rejects registering an admin role before touching persistence", async () => {
    await request(createApp()).post("/api/v1/auth/register").send({ full_name: "Valid Name", email: "new@example.com", password: bootstrapInput.password, confirm_password: bootstrapInput.password, phone: "0901234567", role: "ADMIN" }).expect(422);
    expect(client.user.create).not.toHaveBeenCalled();
  });
  it("has no public admin registration route", async () => {
    await request(createApp()).post("/api/v1/auth/register-admin").send({}).expect(404);
  });
});

describe("operator-only first admin bootstrap", () => {
  const prismaClient = client as unknown as PrismaClient;
  it("hashes a new password and creates a verified admin plus audit atomically", async () => {
    client.user.count.mockResolvedValue(0);
    client.user.findUnique.mockResolvedValue(null);
    client.user.create.mockResolvedValue({ id: "first", email: "new@example.com", fullName: "Admin First" });
    await bootstrapFirstAdmin(prismaClient, bootstrapInput);
    const data = client.user.create.mock.calls[0]![0].data;
    expect(data).toMatchObject({ role: "ADMIN", status: "ACTIVE", email: "new@example.com", fullName: "Admin First", emailVerifiedAt: expect.any(Date) });
    expect(data.passwordHash).not.toContain(bootstrapInput.password);
    expect(await bcrypt.compare(bootstrapInput.password, data.passwordHash)).toBe(true);
    expect(client.$queryRaw).toHaveBeenCalledOnce();
    expect(client.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ actorId: "first", action: "admin.bootstrap", entityId: "first" }) });
    expect(client.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable" });
  });
  it("refuses once any admin exists", async () => {
    client.user.count.mockResolvedValue(1);
    await expect(bootstrapFirstAdmin(prismaClient, bootstrapInput)).rejects.toThrow("Đã có quản trị viên");
    expect(client.user.create).not.toHaveBeenCalled();
    expect(client.auditLog.create).not.toHaveBeenCalled();
  });
  it("does not promote an existing user", async () => {
    client.user.count.mockResolvedValue(0);
    client.user.findUnique.mockResolvedValue({ id: "existing" });
    await expect(bootstrapFirstAdmin(prismaClient, bootstrapInput)).rejects.toThrow("không nâng quyền");
    expect(client.user.create).not.toHaveBeenCalled();
    expect(client.user.update).not.toHaveBeenCalled();
  });
});
