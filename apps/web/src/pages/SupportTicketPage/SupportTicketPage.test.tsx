import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SupportTicketPage } from "@/pages/SupportTicketPage/SupportTicketPage";
import { httpContext } from "@/tests/http-context";
import { member, product, ticket } from "@/tests/test-data";
import { createMemberPageHarness } from "@/tests/renderMemberPage";

let context: ReturnType<typeof httpContext>;
const harness = createMemberPageHarness();
const show = harness.show;
beforeEach(() => { context = httpContext({ ...member }); context.reply("GET", "/products/" + product.id, product); });
afterEach(() => { harness.cleanup(); vi.unstubAllGlobals(); });

describe("member workflows through the HTTP adapter", () => {
it("renders the reopened ticket returned after replying to a resolved request", async () => {
    context.reply("GET", "/support/tickets/" + ticket.id, { ...ticket, status: "RESOLVED", resolution_note: "Kết luận cũ" });
    context.reply("POST", "/support/tickets/" + ticket.id + "/messages", ticket);
    const user = userEvent.setup(); show(<SupportTicketPage />, "/support/" + ticket.id, "/support/:id");
    expect(await screen.findByText("Kết luận cũ")).toBeInTheDocument();
    await user.type(screen.getByLabelText(/Phản hồi/), "Vấn đề vẫn còn xảy ra");
    await user.click(screen.getByRole("button", { name: "Vẫn cần hỗ trợ" }));
    await waitFor(() => expect(screen.queryByText("Kết luận cũ")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Gửi phản hồi" })).toBeInTheDocument();
  });
});
