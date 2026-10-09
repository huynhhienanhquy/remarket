import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SupportNewPage } from "@/pages/SupportNewPage/SupportNewPage";
import { httpContext } from "@/tests/http-context";
import { member, product, ticket, timestamp } from "@/tests/test-data";
import { createMemberPageHarness } from "@/tests/renderMemberPage";

let context: ReturnType<typeof httpContext>;
const harness = createMemberPageHarness();
const show = harness.show;
beforeEach(() => { context = httpContext({ ...member }); context.reply("GET", "/products/" + product.id, product); });
afterEach(() => { harness.cleanup(); vi.unstubAllGlobals(); });

describe("member workflows through the HTTP adapter", () => {
it("lets a locked user create and reply to an account support request", async () => {
    context.viewer = { ...member, status: "LOCKED" };
    context.reply("POST", "/support/tickets", ticket);
    context.reply("GET", "/support/tickets/" + ticket.id, ticket);
    context.on("POST", "/support/tickets/" + ticket.id + "/messages", (request) => ({
      ...ticket, messages: [{ id: "reply-test", sender: { id: member.id, name: member.full_name, role: "USER" },
        message: (request.body as { message: string }).message, created_at: timestamp }],
    }));
    const user = userEvent.setup(); show(<SupportNewPage />, "/support/new");
    await user.type(await screen.findByLabelText(/Tiêu đề/), ticket.subject);
    await user.type(screen.getByLabelText(/Nội dung/), "Tôi muốn được kiểm tra lại tài khoản bị khóa.");
    await user.click(screen.getByRole("button", { name: "Gửi yêu cầu" }));
    await user.type(await screen.findByLabelText(/Phản hồi/), "Thông tin bổ sung của tôi");
    await user.click(screen.getByRole("button", { name: "Gửi phản hồi" }));
    expect(await screen.findByText("Thông tin bổ sung của tôi")).toBeInTheDocument();
    expect(context.requests("POST", "/support/tickets")[0]?.body).toMatchObject({ type: "ACCOUNT" });
  });
});
