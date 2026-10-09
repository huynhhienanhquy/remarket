import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SellerProfilePage } from "@/pages/SellerProfilePage/SellerProfilePage";
import { httpContext, page } from "@/tests/http-context";
import { member, seller } from "@/tests/test-data";
import { createMemberPageHarness } from "@/tests/renderMemberPage";

let context: ReturnType<typeof httpContext>;
const harness = createMemberPageHarness();
beforeEach(() => {
  context = httpContext(member);
  context.reply("GET", `/users/${seller.id}`, { seller });
  context.reply("GET", `/users/${seller.id}/products`, page([]));
  context.reply("GET", `/users/${seller.id}/reviews`, page([]));
});
afterEach(() => { harness.cleanup(); vi.unstubAllGlobals(); });

describe("seller-profile permissions and tabs", () => {
  it("loads only the active tab and resets pagination when switching to reviews", async () => {
    harness.show(<SellerProfilePage />, `/users/${seller.id}?page=3`, "/users/:id");
    await screen.findByRole("heading", { name: seller.name });
    await waitFor(() => expect(context.requests("GET", `/users/${seller.id}/products`)).toHaveLength(1));
    expect(context.requests("GET", `/users/${seller.id}/reviews`)).toHaveLength(0);
    await userEvent.click(screen.getByRole("tab", { name: "Đánh giá" }));
    await waitFor(() => expect(context.requests("GET", `/users/${seller.id}/reviews`)).toHaveLength(1));
    expect(context.requests("GET", `/users/${seller.id}/reviews`)[0]?.url.searchParams.get("page")).toBe("1");
    expect(screen.getByRole("tab", { name: "Đánh giá" })).toHaveAttribute("aria-selected", "true");
  });

  it("redirects guests to login before opening a report", async () => {
    context.viewer = null;
    harness.show(<SellerProfilePage />, `/users/${seller.id}`, "/users/:id");
    await userEvent.click(await screen.findByRole("button", { name: "Tùy chọn hồ sơ" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Báo cáo người dùng" }));
    expect(await screen.findByRole("heading", { name: "Đăng nhập để tiếp tục" })).toBeInTheDocument();
    expect(context.requests("POST", "/reports")).toHaveLength(0);
  });
});
