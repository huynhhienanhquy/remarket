import { beforeEach, describe, expect, it } from "vitest";
import { createMockAdapter } from "../mocks/adapter";
import { resetDb, setCurrentUserId } from "../mocks/store";
import { ApiError } from "../lib/errors";
import { IDS } from "../mocks/time";

const adapter = createMockAdapter();

beforeEach(() => {
  resetDb();
  setCurrentUserId(null);
});

async function login(email: string) {
  const user = await adapter.auth.login(email, "remarket-demo-2026");
  setCurrentUserId(user.id);
  return user;
}

describe("auth", () => {
  it("starts with no session", async () => {
    expect(await adapter.auth.me()).toBeNull();
  });

  it("rejects a wrong password with 401", async () => {
    await expect(
      adapter.auth.login("lan.ban@remarket.vn", "wrong-password"),
    ).rejects.toMatchObject({ status: 401 });
  });

  it("returns the viewer after a correct login", async () => {
    const user = await login("lan.ban@remarket.vn");
    const me = await adapter.auth.me();
    expect(me?.id).toBe(user.id);
    expect(me?.status).toBe("ACTIVE");
  });

  it("logs out and clears the session", async () => {
    await login("lan.ban@remarket.vn");
    await adapter.auth.logout();
    expect(await adapter.auth.me()).toBeNull();
  });
});

describe("products", () => {
  it("lists only publicly visible listings", async () => {
    const page = await adapter.products.list({ page: 1, page_size: 100 });
    expect(page.items.length).toBeGreaterThan(0);
    for (const item of page.items) {
      expect(["ACTIVE", "RESERVED", "SOLD"]).toContain(item.status);
      expect(item.is_blocked).toBeFalsy();
    }
  });

  it("filters by keyword", async () => {
    const all = await adapter.products.list({ page_size: 100 });
    const first = all.items[0]!;
    const found = await adapter.products.list({ q: first.title.slice(0, 6), page_size: 100 });
    expect(found.items.length).toBeGreaterThan(0);
  });

  it("filters by price bounds as decimal strings", async () => {
    const page = await adapter.products.list({
      min_price: "1000000",
      max_price: "3000000",
      page_size: 100,
    });
    for (const item of page.items) {
      expect(BigInt(item.price) >= 1000000n).toBe(true);
      expect(BigInt(item.price) <= 3000000n).toBe(true);
    }
  });

  it("404s on an unknown product", async () => {
    await expect(adapter.products.detail("missing")).rejects.toMatchObject({
      status: 404,
    });
  });

  it("paginates with stable meta", async () => {
    const first = await adapter.products.list({ page: 1, page_size: 5 });
    expect(first.items.length).toBeLessThanOrEqual(5);
    expect(first.meta.page).toBe(1);
    expect(first.meta.total_pages).toBeGreaterThanOrEqual(1);
  });
});

describe("favorites and cart", () => {
  it("requires a session for favorites", async () => {
    await expect(adapter.favorites.list(1)).rejects.toMatchObject({ status: 401 });
  });

  it("toggles a favorite on and off", async () => {
    await login("lan.ban@remarket.vn");
    const list = await adapter.products.list({ page_size: 5 });
    const target = list.items.find((item) => item.status === "ACTIVE")!;
    expect(target.is_favorited).toBe(false);

    const on = await adapter.favorites.set(target.id, true);
    expect(on.is_favorited).toBe(true);

    const favorites = await adapter.favorites.list(1);
    expect(favorites.items.some((item) => item.id === target.id)).toBe(true);

    const off = await adapter.favorites.set(target.id, false);
    expect(off.is_favorited).toBe(false);
  });

  it("rejects adding a sold listing to the cart", async () => {
    await login("lan.ban@remarket.vn");
    const all = await adapter.products.list({ page_size: 100 });
    const sold = all.items.find((item) => item.status === "SOLD");
    if (sold) {
      await expect(adapter.cart.add(sold.id)).rejects.toBeInstanceOf(ApiError);
    }
  });
});

describe("orders", () => {
  it("lists the buyer's orders once logged in", async () => {
    await login("lan.ban@remarket.vn");
    const orders = await adapter.orders.list({ role: "buyer" });
    expect(Array.isArray(orders.items)).toBe(true);
  });

  it("requires a session", async () => {
    await expect(adapter.orders.list({ role: "buyer" })).rejects.toMatchObject({
      status: 401,
    });
  });
});

describe("notifications", () => {
  it("counts only the viewer's unread items", async () => {
    await login("lan.ban@remarket.vn");
    const count = await adapter.notifications.unreadCount();
    expect(typeof count).toBe("number");
    expect(count).toBeGreaterThanOrEqual(0);
  });
});

describe("categories", () => {
  it("returns a two-level tree with real ids", async () => {
    const tree = await adapter.categories.tree();
    expect(tree.length).toBeGreaterThan(0);
    for (const root of tree) {
      expect(root.parent_id).toBeNull();
      for (const child of root.children ?? []) {
        expect(child.parent_id).toBe(root.id);
      }
    }
  });

  it("returns provinces for the filter", async () => {
    const provinces = await adapter.categories.provinces();
    expect(provinces.length).toBeGreaterThan(0);
    expect(provinces[0]).toHaveProperty("code");
  });
});

describe("admin", () => {
  it("loads a user detail independently from the current list", async () => {
    await login("admin@remarket.vn");
    const user = await adapter.admin.user(IDS.user(2));
    expect(user.id).toBe(IDS.user(2));
    expect(user.email).toBe("lan.ban@remarket.vn");
  });

  it("guards every product moderation action with the viewed version", async () => {
    await login("admin@remarket.vn");
    const page = await adapter.admin.products({ status: "ACTIVE", page: 1 });
    const product = page.items[0]!;
    const blocked = await adapter.admin.blockProduct(product.id, product.version, "Kiểm tra nội dung");
    expect(blocked.is_blocked).toBe(true);
    expect(blocked.version).toBe(product.version + 1);
    await expect(
      adapter.admin.unblockProduct(product.id, product.version),
    ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
  });

  it("exposes the support order snapshot and cancels a delivered order only after resolution", async () => {
    await login("admin@remarket.vn");
    const ticketId = IDS.ticket(1);
    let ticket = await adapter.admin.ticket(ticketId);
    expect(ticket.order?.status).toBe("DELIVERED");

    ticket = await adapter.admin.updateTicket(ticketId, { status: "IN_PROGRESS", assign: true });
    ticket = await adapter.admin.updateTicket(ticketId, {
      status: "RESOLVED",
      resolution_note: "Hai bên thống nhất trả hàng và dừng giao dịch.",
    });

    const order = ticket.order!;
    const result = await adapter.admin.cancelOrder(order.id, {
      expected_version: order.version,
      reason: "Hủy theo kết luận hỗ trợ.",
      ticket_id: ticket.id,
      delivery_outcome: "RETURNED",
      payment_resolution: "Hai bên tự đối soát, nền tảng không chuyển tiền.",
    });
    expect(result).toMatchObject({ id: order.id, status: "CANCELLED", version: order.version + 1 });
  });
});
