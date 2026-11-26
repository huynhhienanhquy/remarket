import { screen, waitFor, within } from "@testing-library/react";
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
  it("shows saved details and applies edits from the dialog only after saving", async () => {
    context.on("PATCH", "/auth/profile", (request) => {
      context.viewer = { ...member, ...(request.body as Partial<typeof member>) };
      return context.viewer;
    });
    const user = userEvent.setup();
    show(<AccountPage />);
    const details = within(await screen.findByRole("region", { name: "Thông tin cá nhân" }));
    const edit = details.getByRole("button", { name: "Chỉnh sửa" });
    expect(details.getAllByText(member.full_name)).toHaveLength(2);
    expect(details.getAllByText(member.email)).toHaveLength(2);
    expect(screen.queryByRole("textbox", { name: "Họ và tên" })).not.toBeInTheDocument();

    await user.click(edit);
    let editor = within(screen.getByRole("dialog", { name: "Chỉnh sửa thông tin cá nhân" }));
    let name = editor.getByRole("textbox", { name: "Họ và tên" });
    expect(name).toHaveFocus();
    await user.clear(name);
    await user.type(name, "Tên bỏ qua");
    await user.click(editor.getByRole("button", { name: "Hủy" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(edit).toHaveFocus();
    expect(context.requests("PATCH", "/auth/profile")).toHaveLength(0);

    await user.click(edit);
    editor = within(screen.getByRole("dialog", { name: "Chỉnh sửa thông tin cá nhân" }));
    name = editor.getByRole("textbox", { name: "Họ và tên" });
    expect(name).toHaveValue(member.full_name);
    await user.clear(name);
    await user.type(name, "Tên hồ sơ mới");
    await user.click(editor.getByRole("button", { name: "Lưu thay đổi" }));
    await waitFor(() => expect(context.requests("PATCH", "/auth/profile")).toHaveLength(1));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(details.getAllByText("Tên hồ sơ mới")).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Đặt lại mật khẩu" })).toHaveAttribute("href", "/forgot-password");
  });
});
