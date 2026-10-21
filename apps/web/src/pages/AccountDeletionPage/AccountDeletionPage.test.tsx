import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AccountDeletionPage } from "./AccountDeletionPage";
import { httpContext } from "@/tests/http-context";
import { member } from "@/tests/test-data";
import { createMemberPageHarness } from "@/tests/renderMemberPage";
const harness = createMemberPageHarness();
let context: ReturnType<typeof httpContext>;
beforeEach(() => {
  context = httpContext({ ...member });
});
afterEach(() => {
  harness.cleanup();
  vi.unstubAllGlobals();
});
describe("account deletion confirmation", () => {
  it("requires a password and explicit confirmation before sending a deletion request", async () => {
    context.reply("POST", "/mobile/delete-account", { deleted: true });
    harness.show(<AccountDeletionPage />, "/delete-account");
    const user = userEvent.setup();
    const password = await screen.findByLabelText("Mật khẩu xác nhận");
    await user.type(password, "password-confirm-delete");
    expect(
      screen.getByRole("button", { name: "Xóa tài khoản của tôi" }),
    ).toBeDisabled();
    expect(context.requests("POST", "/mobile/delete-account")).toHaveLength(0);
    await user.click(screen.getByRole("checkbox"));
    await user.click(
      screen.getByRole("button", { name: "Xóa tài khoản của tôi" }),
    );
    await waitFor(() =>
      expect(context.requests("POST", "/mobile/delete-account")).toHaveLength(
        1,
      ),
    );
    await screen.findByText("Tài khoản đã được xóa");
  });
});
