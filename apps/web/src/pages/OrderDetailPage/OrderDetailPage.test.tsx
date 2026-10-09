import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OrderDetail, Review } from "@remarket/shared";
import { OrderDetailPage } from "@/pages/OrderDetailPage/OrderDetailPage";
import { failure, httpContext } from "@/tests/http-context";
import { member, seller, timestamp } from "@/tests/test-data";
import { createMemberPageHarness } from "@/tests/renderMemberPage";

const order: OrderDetail = {
  id: "order-test", code: "ORDER-TEST", role: "seller", counterparty: seller,
  status: "PENDING", delivery_method: "COD", items: [], total_amount: "100000",
  created_at: timestamp, expires_at: null, version: 7, subtotal: "100000",
  shipping_fee: "0", currency: "VND",
  delivery: { method: "COD", recipient_name: member.full_name, recipient_phone: member.phone!,
    delivery_address: member.default_address!, carrier: null, tracking_code: null },
  status_history: [], allowed_actions: ["confirm", "support"], completion_block_reason: null,
  cancellation_reason: null, confirmed_at: null, shipped_at: null, delivered_at: null,
  completed_at: null, cancelled_at: null,
  review: { can_review: false, reason: null, existing: null }, conversation_id: null,
};
let context: ReturnType<typeof httpContext>;
const harness = createMemberPageHarness();
beforeEach(() => { context = httpContext(member); context.reply("GET", `/orders/${order.id}`, order); });
afterEach(() => { harness.cleanup(); vi.unstubAllGlobals(); });

describe("order actions through the HTTP adapter", () => {
  it("uses the server role and permissions, sends the current version and refreshes the order", async () => {
    context.on("POST", `/orders/${order.id}/actions`, () => {
      const updated = { ...order, version: 8, status: "CONFIRMED", allowed_actions: ["support"] };
      context.reply("GET", `/orders/${order.id}`, updated);
      return updated;
    });
    harness.show(<OrderDetailPage role="buyer" />, `/sales/${order.id}`, "/sales/:id");
    await userEvent.click(await screen.findByRole("button", { name: "Xác nhận đơn hàng" }));
    expect(context.requests("POST", `/orders/${order.id}/actions`)[0]?.body).toEqual({ action: "confirm", expected_version: 7 });
    await waitFor(() => expect(screen.queryByRole("button", { name: "Xác nhận đơn hàng" })).not.toBeInTheDocument());
    expect(screen.getByRole("link", { name: "Đơn bán" })).toHaveAttribute("href", "/sales");
    expect(context.requests("GET", `/orders/${order.id}`)).toHaveLength(2);
  });

  it("refreshes a version conflict and keeps the existing user-facing error", async () => {
    context.reply("POST", `/orders/${order.id}/actions`, failure(409, "VERSION_CONFLICT"));
    harness.show(<OrderDetailPage role="seller" />, `/sales/${order.id}`, "/sales/:id");
    await userEvent.click(await screen.findByRole("button", { name: "Xác nhận đơn hàng" }));
    expect(await screen.findByText("Đơn hàng đã thay đổi, dữ liệu đã được tải lại.")).toBeInTheDocument();
    await waitFor(() => expect(context.requests("GET", `/orders/${order.id}`)).toHaveLength(2));
    expect(screen.getByRole("button", { name: "Xác nhận đơn hàng" })).not.toBeDisabled();
  });

  it("shows the current not-found state without exposing order actions", async () => {
    context.reply("GET", `/orders/${order.id}`, failure(404, "NOT_FOUND"));
    harness.show(<OrderDetailPage role="buyer" />, `/orders/${order.id}`, "/orders/:id");
    expect(await screen.findByText("Không tìm thấy đơn hàng này")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Xác nhận đơn hàng" })).not.toBeInTheDocument();
  });
});

const submittedReview: Review = {
  id: "review-test", order_id: order.id, rating: 4, comment: "Người bán giao hàng đúng hẹn.",
  created_at: timestamp, reviewer: { id: member.id, name: member.full_name, avatar_url: null },
  reviewed_user_id: seller.id,
};
const completedOrder: OrderDetail = {
  ...order, role: "buyer", status: "COMPLETED", completed_at: timestamp,
  allowed_actions: ["review", "support"], review: { can_review: true, reason: null, existing: null },
};
function showCompleted(overrides: Partial<OrderDetail> = {}) {
  context.reply("GET", `/orders/${order.id}`, { ...completedOrder, ...overrides });
  harness.show(<OrderDetailPage role="seller" />, `/orders/${order.id}`, "/orders/:id");
}
async function openReview() {
  await userEvent.click(await screen.findByRole("button", { name: "Đánh giá người bán" }));
  return within(screen.getByRole("dialog", { name: "Đánh giá người bán" }));
}
function acceptReview() {
  context.on("POST", `/orders/${order.id}/reviews`, () => {
    context.reply("GET", `/orders/${order.id}`, {
      ...completedOrder, allowed_actions: ["support"],
      review: { can_review: false, reason: "Bạn đã đánh giá đơn hàng này.", existing: submittedReview },
    });
    return submittedReview;
  });
}

describe("seller review after completing an order", () => {
  it("lets the seller read the buyer's review without offering create or edit actions", async () => {
    context.reply("GET", `/orders/${order.id}`, {
      ...completedOrder, role: "seller", allowed_actions: ["support"],
      review: { can_review: false, reason: "Chỉ người mua được đánh giá đơn hàng.", existing: submittedReview },
    });
    harness.show(<OrderDetailPage role="buyer" />, `/sales/${order.id}`, "/sales/:id");
    expect(await screen.findByText("Đánh giá từ người mua: 4/5 sao")).toBeInTheDocument();
    expect(screen.getByText(`Người đánh giá: ${member.full_name}`)).toBeInTheDocument();
    expect(screen.getByText(submittedReview.comment!)).toBeInTheDocument();
    expect(screen.getByText("Đánh giá của người mua chỉ có thể xem.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Đánh giá người bán" })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(context.requests("POST", `/orders/${order.id}/reviews`)).toHaveLength(0);
  });

  it("explains when the completed sale has no review yet", async () => {
    context.reply("GET", `/orders/${order.id}`, {
      ...completedOrder, role: "seller", allowed_actions: ["support"],
      review: { can_review: false, reason: "Chỉ người mua được đánh giá đơn hàng.", existing: null },
    });
    harness.show(<OrderDetailPage role="seller" />, `/sales/${order.id}`, "/sales/:id");
    expect(await screen.findByText("Người mua chưa đánh giá đơn hàng này.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Đánh giá người bán" })).not.toBeInTheDocument();
  });

  it("opens the review form after completion, requires an explicit rating and persists it through the HTTP API", async () => {
    context.reply("GET", `/orders/${order.id}`, {
      ...completedOrder, status: "DELIVERED", completed_at: null, allowed_actions: ["complete", "support"],
      review: { can_review: false, reason: "Chỉ đánh giá sau khi đơn hàng hoàn tất.", existing: null },
    });
    context.on("POST", `/orders/${order.id}/actions`, () => {
      context.reply("GET", `/orders/${order.id}`, completedOrder);
      return completedOrder;
    });
    acceptReview();
    harness.show(<OrderDetailPage role="buyer" />, `/orders/${order.id}`, "/orders/:id");
    await userEvent.click(await screen.findByRole("button", { name: "Hoàn tất đơn hàng" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Hoàn tất" }));
    const dialog = await openReview();
    expect(dialog.getAllByRole("radio")).toHaveLength(5);
    expect(dialog.getAllByRole("radio").every((radio) => !radio.hasAttribute("checked"))).toBe(true);
    await userEvent.click(dialog.getByRole("button", { name: "Gửi đánh giá" }));
    expect(await dialog.findByText("Vui lòng chọn số sao đánh giá.")).toBeInTheDocument();
    expect(context.requests("POST", `/orders/${order.id}/reviews`)).toHaveLength(0);
    await userEvent.click(dialog.getByRole("radio", { name: "4 sao — Tốt" }));
    await userEvent.type(dialog.getByRole("textbox", { name: "Nhận xét" }), `  ${submittedReview.comment}  `);
    await userEvent.click(dialog.getByRole("button", { name: "Gửi đánh giá" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(context.requests("POST", `/orders/${order.id}/reviews`)[0]?.body).toEqual({ rating: 4, comment: submittedReview.comment });
    expect(await screen.findByText("Đánh giá đã gửi: 4/5 sao")).toBeInTheDocument();
    expect(screen.getByText(submittedReview.comment!)).toBeInTheDocument();
    expect(screen.getByText("Đã gửi đánh giá người bán.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Đánh giá người bán" })).not.toBeInTheDocument();
    expect(screen.queryByText("Bước tiếp theo:")).not.toBeInTheDocument();
    await waitFor(() => expect(context.requests("GET", `/orders/${order.id}`).length).toBeGreaterThanOrEqual(3));
  });

  it("allows a rating without a comment and prevents repeated submission while pending", async () => {
    let resolveReview: (value: Review) => void = () => { throw new Error("Review request not started"); };
    context.on("POST", `/orders/${order.id}/reviews`, () => new Promise<Review>((resolve) => { resolveReview = resolve; }));
    showCompleted();
    const dialog = await openReview();
    await userEvent.click(dialog.getByRole("radio", { name: "1 sao — Rất tệ" }));
    const submit = dialog.getByRole("button", { name: "Gửi đánh giá" });
    await userEvent.dblClick(submit);
    expect(submit).toBeDisabled();
    expect(dialog.getByRole("button", { name: "Hủy" })).toBeDisabled();
    await userEvent.keyboard("{Escape}");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(context.requests("POST", `/orders/${order.id}/reviews`)).toHaveLength(1);
    expect(context.requests("POST", `/orders/${order.id}/reviews`)[0]?.body).toEqual({ rating: 1, comment: null });
    context.reply("GET", `/orders/${order.id}`, { ...completedOrder,
      review: { can_review: false, reason: null, existing: { ...submittedReview, rating: 1, comment: null } } });
    resolveReview({ ...submittedReview, rating: 1, comment: null });
    expect(await screen.findByText("Đánh giá đã gửi: 1/5 sao")).toBeInTheDocument();
  });

  it("keeps the selected rating and comment after a network error and lets the buyer retry", async () => {
    context.on("POST", `/orders/${order.id}/reviews`, () => { throw new TypeError("offline"); });
    showCompleted();
    const dialog = await openReview();
    await userEvent.click(dialog.getByRole("radio", { name: "4 sao — Tốt" }));
    await userEvent.type(dialog.getByRole("textbox"), submittedReview.comment!);
    await userEvent.click(dialog.getByRole("button", { name: "Gửi đánh giá" }));
    expect(await dialog.findByRole("alert")).toHaveTextContent("Không thể kết nối máy chủ");
    expect(dialog.getByRole("radio", { name: "4 sao — Tốt" })).toBeChecked();
    expect(dialog.getByRole("textbox")).toHaveValue(submittedReview.comment);
    acceptReview();
    await userEvent.click(dialog.getByRole("button", { name: "Gửi đánh giá" }));
    expect(await screen.findByText("Đánh giá đã gửi: 4/5 sao")).toBeInTheDocument();
    expect(context.requests("POST", `/orders/${order.id}/reviews`)).toHaveLength(2);
  });

  it("links server validation errors to the comment and preserves the draft", async () => {
    context.reply("POST", `/orders/${order.id}/reviews`, new Response(JSON.stringify({ success: false,
      error: { code: "VALIDATION_ERROR", message: "Nhận xét chưa hợp lệ.", details: { fields: { comment: "Kiểm tra nhận xét." } } },
    }), { status: 422, headers: { "Content-Type": "application/json" } }));
    showCompleted();
    const dialog = await openReview();
    await userEvent.click(dialog.getByRole("radio", { name: "3 sao — Bình thường" }));
    await userEvent.type(dialog.getByRole("textbox"), "Nhận xét của tôi");
    await userEvent.click(dialog.getByRole("button", { name: "Gửi đánh giá" }));
    expect(await dialog.findByText("Kiểm tra nhận xét.")).toBeInTheDocument();
    expect(dialog.getByRole("textbox")).toHaveAttribute("aria-invalid", "true");
    expect(dialog.getByRole("textbox")).toHaveValue("Nhận xét của tôi");
    await waitFor(() => expect(dialog.getByRole("alert")).toHaveFocus());
  });

  it("refreshes a review eligibility conflict and shows the server's read-only reason", async () => {
    context.on("POST", `/orders/${order.id}/reviews`, () => {
      context.reply("GET", `/orders/${order.id}`, { ...completedOrder, allowed_actions: ["support"],
        review: { can_review: false, reason: "Đã hết thời gian đánh giá đơn hàng.", existing: null } });
      return failure(409, "REVIEW_NOT_ALLOWED");
    });
    showCompleted();
    const dialog = await openReview();
    await userEvent.click(dialog.getByRole("radio", { name: "5 sao — Rất tốt" }));
    await userEvent.click(dialog.getByRole("button", { name: "Gửi đánh giá" }));
    expect(await screen.findByText("Đã hết thời gian đánh giá đơn hàng.")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Đánh giá người bán" })).not.toBeInTheDocument();
  });

  it.each([
    ["already reviewed", { review: { can_review: false, reason: "Bạn đã đánh giá đơn hàng này.", existing: submittedReview } }],
    ["expired", { review: { can_review: false, reason: "Đã hết thời gian đánh giá đơn hàng.", existing: null } }],
    ["seller", { role: "seller" as const }],
    ["not completed", { status: "DELIVERED" as const }],
    ["no server permission", { allowed_actions: ["support" as const] }],
  ])("does not offer review when %s", async (_label, overrides) => {
    showCompleted(overrides);
    await screen.findByText(/Đơn hàng #/);
    expect(screen.queryByRole("button", { name: "Đánh giá người bán" })).not.toBeInTheDocument();
  });

  it.each([
    [{ ...member, status: "LOCKED" as const }, "Tài khoản đang bị hạn chế nên không thể đánh giá."],
    [{ ...member, email_verified_at: null }, "Vui lòng xác minh email trước khi đánh giá."],
  ])("explains account restrictions instead of opening a form that cannot be submitted", async (viewer, reason) => {
    context.viewer = viewer;
    showCompleted();
    expect(await screen.findByText(reason)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Đánh giá người bán" })).not.toBeInTheDocument();
  });

  it("supports keyboard rating and asks before discarding a draft", async () => {
    showCompleted();
    const dialog = await openReview();
    const first = dialog.getByRole("radio", { name: "1 sao — Rất tệ" });
    first.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(dialog.getByRole("radio", { name: "2 sao — Tệ" })).toBeChecked();
    await userEvent.type(dialog.getByRole("textbox"), "Nhận xét chưa gửi");
    await userEvent.keyboard("{Escape}");
    const discard = within(screen.getByRole("dialog", { name: "Bỏ nội dung đánh giá?" }));
    await userEvent.click(discard.getByRole("button", { name: "Tiếp tục viết" }));
    expect(dialog.getByRole("textbox")).toHaveValue("Nhận xét chưa gửi");
    await userEvent.click(dialog.getByRole("button", { name: "Hủy" }));
    await userEvent.click(within(screen.getByRole("dialog", { name: "Bỏ nội dung đánh giá?" })).getByRole("button", { name: "Bỏ đánh giá" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(context.requests("POST", `/orders/${order.id}/reviews`)).toHaveLength(0);
  });
});
