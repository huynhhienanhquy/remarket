import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ResetPasswordPage } from "./ResetPasswordPage";
import { failure, httpContext } from "../../tests/http-context";
import { member } from "../../tests/test-data";
import { http } from "../../lib/api/http";
import { getSessionUser, updateSessionUser } from "../../lib/api/session";

function UrlProbe() { return <output data-testid="url">{useLocation().search}</output>; }
let client: QueryClient;
afterEach(() => { client?.clear(); vi.unstubAllGlobals(); http.setAccessToken(null); });
function show() {
  client = new QueryClient();
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={["/reset-password?token=one-time-test&returnTo=%2Forders"]}><ResetPasswordPage /><UrlProbe /></MemoryRouter></QueryClientProvider>);
}
describe("password-reset session and token handling", () => {
  it("removes the URL token but submits its in-memory value and clears private session/cache", async () => {
    const context = httpContext(member);
    http.setAccessToken("current-token"); updateSessionUser(member);
    context.reply("POST", "/auth/reset-password", { accepted: true });
    show(); client.setQueryData(["orders", "private"], "previous-data");
    await waitFor(() => expect(screen.getByTestId("url")).not.toHaveTextContent("token="));
    expect(screen.getByTestId("url")).toHaveTextContent("returnTo=");
    await userEvent.type(screen.getByLabelText(/Mật khẩu mới/), "new-password-2026");
    await userEvent.type(screen.getByLabelText(/Nhập lại mật khẩu/), "new-password-2026");
    await userEvent.click(screen.getByRole("button", { name: "Cập nhật mật khẩu" }));
    expect(await screen.findByText("Mật khẩu đã được cập nhật. Bạn có thể đăng nhập ngay bây giờ.")).toBeInTheDocument();
    expect(context.requests("POST", "/auth/reset-password")[0]?.body).toEqual({ token: "one-time-test", password: "new-password-2026" });
    expect(http.getAccessToken()).toBeNull(); expect(getSessionUser()).toBeNull();
    expect(client.getQueryData(["orders", "private"])).toBeUndefined();
    expect(screen.queryByLabelText(/Mật khẩu mới/)).not.toBeInTheDocument();
  });
  it("retains current session and input after a rejected reset", async () => {
    const context = httpContext(member);
    http.setAccessToken("current-token"); updateSessionUser(member);
    context.reply("POST", "/auth/reset-password", failure(422, "VALIDATION_ERROR"));
    show();
    await userEvent.type(screen.getByLabelText(/Mật khẩu mới/), "new-password-2026");
    await userEvent.type(screen.getByLabelText(/Nhập lại mật khẩu/), "new-password-2026");
    await userEvent.click(screen.getByRole("button", { name: "Cập nhật mật khẩu" }));
    expect(await screen.findByText("Request rejected")).toBeInTheDocument();
    expect(http.getAccessToken()).toBe("current-token");
    expect(screen.getByLabelText(/Mật khẩu mới/)).toHaveValue("new-password-2026");
  });
});
