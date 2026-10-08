import { beforeEach, describe, expect, it } from "vitest";
import { adminApi } from "../mocks/adapter-admin";
import { categoriesApi } from "../mocks/adapter-auth";
import { db, resetDb, setCurrentUserId } from "../mocks/store";
import { IDS } from "../mocks/time";

beforeEach(() => {
  resetDb();
  setCurrentUserId(IDS.user(1));
});

describe("admin dashboard and filters", () => {
  it("counts the full selected day, ignores non-completed/deleted rows and preserves large money values", async () => {
    const database = db();
    const completed = database.orders.find((o) => o.status === "COMPLETED")!;
    database.orders = [
      { ...completed, id: "first", completed_at: "2026-10-06T17:00:00Z", total_amount: "9007199254740993" },
      { ...completed, id: "last", completed_at: "2026-10-07T16:59:59.999Z", total_amount: "1" },
      { ...completed, id: "outside", completed_at: "2026-10-07T17:00:00Z", total_amount: "99" },
      { ...completed, id: "cancelled", status: "CANCELLED", completed_at: "2026-10-07T12:00:00Z", total_amount: "99" },
    ];
    database.products[0]!.deleted_at = "2026-10-07T12:00:00Z";
    const dashboard = await adminApi.dashboard("2026-10-07", "2026-10-07");
    expect(dashboard.completed_orders_in_period).toBe(2);
    expect(dashboard.completed_order_value_in_period).toBe("9007199254740994");
    expect(Object.keys(dashboard.products_by_status).sort()).toEqual(["ACTIVE", "INACTIVE", "PENDING", "REJECTED", "RESERVED", "SOLD"]);
    expect(Object.values(dashboard.products_by_status).reduce((a, b) => a + b, 0)).toBe(database.products.filter((p) => !p.deleted_at).length);
    expect(dashboard.unresolved_tickets).toBe(database.tickets.filter((t) => t.status === "OPEN" || t.status === "IN_PROGRESS").length);
  });
  it("keeps inactive admin categories accessible for reactivation but not in the public tree", async () => {
    const category = await adminApi.createCategory({ name: "Danh mục mới", slug: "danh-muc-moi", parent_id: null });
    await adminApi.updateCategory(category.id, { status: "INACTIVE" });
    expect((await adminApi.categoryTree()).some((c) => c.id === category.id)).toBe(true);
    expect((await adminApi.categories({ status: "INACTIVE", page: 1 })).items.some((c) => c.id === category.id)).toBe(true);
    expect((await categoriesApi.tree()).some((c) => c.id === category.id)).toBe(false);
    await adminApi.updateCategory(category.id, { status: "ACTIVE" });
    expect((await categoriesApi.tree()).some((c) => c.id === category.id)).toBe(true);
    expect(db().audit_logs.filter((log) => log.entity_id === category.id).map((log) => log.action)).toEqual(["category.create", "category.disable", "category.update"]);
  });
  it("paginates root groups and filters categories by audited actor/action date", async () => {
    for (let i = 0; i < 23; i++) await adminApi.createCategory({ name: "Nhóm " + i, slug: "nhom-" + i, parent_id: null });
    const first = await adminApi.categories({ q: "Nhóm", handled_by: IDS.user(1), page: 1 });
    const second = await adminApi.categories({ q: "Nhóm", handled_by: IDS.user(1), page: 2 });
    expect(first.meta).toMatchObject({ total: 23, total_pages: 2 });
    expect(first.items).toHaveLength(20);
    expect(second.items).toHaveLength(3);
    expect(new Set([...first.items, ...second.items].map((c) => c.id)).size).toBe(23);
    expect((await adminApi.categories({ handled_by: "different-admin", page: 1 })).items).toHaveLength(0);
    expect((await adminApi.categories({ q: "Nhóm", from: "2020-01-01", to: "2020-01-01", page: 1 })).items).toHaveLength(0);
  });
  it("filters users, products and reviews by admin audit actor", async () => {
    const database = db();
    database.audit_logs = [{
      id: "audit", actor_id: IDS.user(1), actor_name: "Admin", actor_type: "ADMIN", action: "user.unlock",
      entity_type: "user", entity_id: IDS.user(2), reason: null, metadata: {}, created_at: new Date().toISOString(),
    }];
    expect((await adminApi.users({ handled_by: IDS.user(1), page: 1 })).items.map((u) => u.id)).toEqual([IDS.user(2)]);
    expect((await adminApi.products({ handled_by: IDS.user(1), page: 1 })).items).toHaveLength(0);
    expect((await adminApi.reviews({ handled_by: IDS.user(1), page: 1 })).items).toHaveLength(0);
  });
});

describe("admin audit and transition guards", () => {
  it("logs assignment, replies and status decisions and never partly assigns on invalid resolution", async () => {
    const ticket = db().tickets.find((t) => t.status === "OPEN")!;
    ticket.assigned_admin_id = null;
    const initialAuditCount = db().audit_logs.length;
    await expect(adminApi.updateTicket(ticket.id, { assign: true, status: "CLOSED" })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(ticket.assigned_admin_id).toBeNull();
    expect(ticket.status).toBe("OPEN");
    expect(db().audit_logs).toHaveLength(initialAuditCount);
    await adminApi.updateTicket(ticket.id, { assign: true });
    await adminApi.replyTicket(ticket.id, "Quản trị viên đã tiếp nhận yêu cầu.");
    expect(ticket.status).toBe("IN_PROGRESS");
    await adminApi.updateTicket(ticket.id, { status: "RESOLVED", resolution_note: "Đã giải quyết xong." });
    expect(db().audit_logs.slice(initialAuditCount).map((a) => a.action)).toEqual(["ticket.assign", "ticket.reply", "ticket.status"]);
    await adminApi.updateTicket(ticket.id, { status: "OPEN" });
    expect(ticket.resolved_at).toBeNull();
    expect(ticket.resolution_note).toBeNull();
  });
  it("never processes the same report twice", async () => {
    const report = db().reports.find((r) => r.status === "PENDING")!;
    await adminApi.rejectReport(report.id, { resolution_note: "Không đủ bằng chứng." });
    const auditCount = db().audit_logs.length;
    await expect(adminApi.resolveReport(report.id, { action: "none", resolution_note: "Xử lý lại." })).rejects.toMatchObject({ code: "INVALID_ORDER_TRANSITION" });
    expect(db().audit_logs).toHaveLength(auditCount);
  });
  it("cannot approve blocked pending products or reject products outside pending", async () => {
    const pending = db().products.find((p) => p.status === "PENDING")!;
    pending.is_blocked = true;
    await expect(adminApi.approveProduct(pending.id, pending.version)).rejects.toMatchObject({ code: "INVALID_ORDER_TRANSITION" });
    const active = db().products.find((p) => p.status === "ACTIVE")!;
    await expect(adminApi.rejectProduct(active.id, active.version, "Không phù hợp")).rejects.toMatchObject({ code: "INVALID_ORDER_TRANSITION" });
  });
});
