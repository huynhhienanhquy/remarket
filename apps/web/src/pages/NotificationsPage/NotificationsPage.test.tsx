import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationsPage } from "@/pages/NotificationsPage/NotificationsPage";
import { httpContext, page } from "@/tests/http-context";
import { member, product, timestamp } from "@/tests/test-data";
import { createMemberPageHarness } from "@/tests/renderMemberPage";

let context: ReturnType<typeof httpContext>;
const harness = createMemberPageHarness();
const show = harness.show;
beforeEach(() => { context = httpContext({ ...member }); context.reply("GET", "/products/" + product.id, product); });
afterEach(() => { harness.cleanup(); vi.unstubAllGlobals(); });

describe("member workflows through the HTTP adapter", () => {
it("opens a seller notification using the authorized order role", async () => {
    context.reply("GET", "/notifications", { ...page([{
      id: "notification-test", user_id: member.id, type: "ORDER_CREATED",
      title: "Thông báo đơn bán kiểm thử", content: "Nội dung an toàn",
      reference_type: "order", reference_id: "order-test", read_at: null, created_at: timestamp,
    }]), meta: { ...page([]).meta, total: 1, unread: 1 } });
    context.reply("POST", "/notifications/notification-test/read", {});
    context.reply("GET", "/orders/order-test", { id: "order-test", role: "seller" });
    show(<NotificationsPage />, "/notifications");
    await userEvent.click(await screen.findByRole("button", { name: /Thông báo đơn bán kiểm thử/ }));
    expect(await screen.findByRole("heading", { name: "Đơn bán đã mở" })).toBeInTheDocument();
    expect(context.requests("POST", "/notifications/notification-test/read")).toHaveLength(1);
  });
});
