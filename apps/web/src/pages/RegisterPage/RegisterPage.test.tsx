import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RegisterPage } from "@/pages/RegisterPage/RegisterPage";
import { httpContext } from "@/tests/http-context";
import { createMemberPageHarness } from "@/tests/renderMemberPage";

let context: ReturnType<typeof httpContext>;
const harness = createMemberPageHarness();
beforeEach(() => { context = httpContext(null); });
afterEach(() => { harness.cleanup(); vi.unstubAllGlobals(); });

describe("registration validation and verification", () => {
  it("focuses the first invalid field and does not submit an empty form", async () => {
    harness.show(<RegisterPage />, "/register");
    await userEvent.click(await screen.findByRole("button", { name: "Tạo tài khoản" }));
    expect(screen.getByLabelText(/Họ và tên/)).toHaveFocus();
    expect(context.requests("POST", "/auth/register")).toHaveLength(0);
  });

  it("submits the existing payload and preserves the return path for email verification", async () => {
    context.reply("POST", "/auth/register", { pending_verification: true });
    harness.show(<RegisterPage />, "/register?returnTo=%2Ffavorites");
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText(/Họ và tên/), "Người dùng mới");
    await user.type(screen.getByLabelText(/^Email/), "new@example.test");
    await user.type(screen.getByLabelText(/Số điện thoại/), "0900000000");
    await user.type(screen.getByLabelText(/^Mật khẩu/), "SecurePassword123!");
    await user.type(screen.getByLabelText(/^Nhập lại mật khẩu/), "SecurePassword123!");
    await user.click(screen.getByRole("button", { name: "Tạo tài khoản" }));
    await waitFor(() => expect(context.requests("POST", "/auth/register")).toHaveLength(1));
    expect(context.requests("POST", "/auth/register")[0]?.body).toEqual({ full_name: "Người dùng mới", email: "new@example.test", phone: "0900000000", password: "SecurePassword123!", confirm_password: "SecurePassword123!" });
    const heading = await screen.findByRole("heading", { name: /^Email verification / });
    expect(heading).toHaveTextContent("email=new%40example.test&returnTo=%2Ffavorites");
  });
});
