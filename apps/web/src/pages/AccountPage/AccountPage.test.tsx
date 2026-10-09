import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AccountPage } from "@/pages/AccountPage/AccountPage";
import { httpContext } from "@/tests/http-context";
import { member, product } from "@/tests/test-data";
import { createMemberPageHarness } from "@/tests/renderMemberPage";

let context: ReturnType<typeof httpContext>;
const harness = createMemberPageHarness();
const show = harness.show;
beforeEach(() => { context = httpContext({ ...member }); context.reply("GET", "/products/" + product.id, product); });
afterEach(() => { harness.cleanup(); vi.unstubAllGlobals(); });

describe("member workflows through the HTTP adapter", () => {
it("saves profile changes and exposes password recovery", async () => {
    context.on("PATCH", "/auth/profile", (request) => {
      context.viewer = { ...member, ...(request.body as Partial<typeof member>) };
      return context.viewer;
    });
    const user = userEvent.setup(); show(<AccountPage />);
    const name = await screen.findByLabelText(/Họ tên/);
    await user.clear(name); await user.type(name, "Tên hồ sơ mới");
    await user.click(screen.getByRole("button", { name: "Lưu thay đổi" }));
    await waitFor(() => expect(context.requests("PATCH", "/auth/profile")).toHaveLength(1));
    await waitFor(() => expect(screen.getByLabelText(/Họ tên/)).toHaveValue("Tên hồ sơ mới"));
    expect(screen.getByRole("link", { name: "Đặt lại mật khẩu" })).toHaveAttribute("href", "/forgot-password");
  });
});
