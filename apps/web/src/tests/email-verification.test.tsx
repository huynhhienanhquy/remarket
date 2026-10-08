import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { SessionProvider } from "../app/SessionProvider";
import { ToastProvider } from "../components/ui";
import { createQueryClient } from "../lib/queryClient";
import { db, resetDb, setCurrentUserId } from "../mocks/store";
import { IDS } from "../mocks/time";
import { VerifyEmailPage } from "../pages/auth/VerifyEmailPage";
import { AdminEmailVerificationsPage } from "../pages/admin/AdminEmailVerificationsPage";
import { api } from "../lib/api";
vi.mock("../lib/api", async () => {
  const { createMockAdapter } = await import("../mocks/adapter");
  return { api: createMockAdapter() };
});
function show(element: ReactNode, path: string) {
  const client = createQueryClient();
  client.setDefaultOptions({ queries: { retry: false }, mutations: { retry: false } });
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><SessionProvider><ToastProvider><Routes>
    <Route path={path.split("?")[0]} element={element} />
    <Route path="/" element={<h1>Trang chủ kiểm thử</h1>} />
  </Routes></ToastProvider></SessionProvider></MemoryRouter></QueryClientProvider>);
}
beforeEach(() => { resetDb(); setCurrentUserId(IDS.user(6)); vi.restoreAllMocks(); });
describe("admin email verification", () => {
  it("submits only the signed-in email, stays unverified and redirects home regardless of returnTo", async () => {
    show(<VerifyEmailPage />, "/verify-email?email=other@example.test&returnTo=%2Fcheckout");
    expect(await screen.findByLabelText("Email tài khoản")).toHaveValue("vy.moi@remarket.vn");
    expect(screen.getByLabelText("Email tài khoản")).toHaveAttribute("readonly");
    await userEvent.click(await screen.findByRole("button", { name: "Gửi yêu cầu xác minh email" }));
    expect(await screen.findByRole("heading", { name: "Trang chủ kiểm thử" })).toBeInTheDocument();
    expect(db().users.find((user) => user.id === IDS.user(6))?.email_verified_at).toBeNull();
    expect(db().notifications.filter((item) => item.type === "EMAIL_VERIFICATION_REQUESTED")).toHaveLength(1);
  });
  it("requires login without letting guests submit arbitrary account emails", async () => {
    setCurrentUserId(null);
    show(<VerifyEmailPage />, "/verify-email?email=other@example.test");
    expect(await screen.findByRole("link", { name: "Đăng nhập để xác minh email" })).toHaveAttribute("href", "/login?returnTo=%2Fverify-email");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Gửi yêu cầu xác minh email" })).not.toBeInTheDocument();
  });
  it("keeps failed requests on the page and supports a deliberate retry", async () => {
    const spy = vi.spyOn(api.auth, "requestEmailVerification").mockRejectedValueOnce(new Error("Mất mạng kiểm thử"));
    show(<VerifyEmailPage />, "/verify-email");
    await userEvent.click(await screen.findByRole("button", { name: "Gửi yêu cầu xác minh email" }));
    expect(await screen.findByText("Chưa thể gửi yêu cầu")).toBeInTheDocument();
    expect(db().users.find((user) => user.id === IDS.user(6))?.email_verification_requested_at).toBeUndefined();
    await userEvent.click(screen.getByRole("button", { name: "Gửi yêu cầu xác minh email" }));
    expect(await screen.findByRole("heading", { name: "Trang chủ kiểm thử" })).toBeInTheDocument();
    expect(spy).toHaveBeenCalledTimes(2);
  });
  it("shows a pending request without offering to send duplicates", async () => {
    await api.auth.requestEmailVerification(); await api.auth.requestEmailVerification();
    show(<VerifyEmailPage />, "/verify-email");
    expect(await screen.findByText("Yêu cầu đang chờ admin duyệt")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Gửi yêu cầu xác minh email" })).not.toBeInTheDocument();
    expect(db().notifications.filter((item) => item.type === "EMAIL_VERIFICATION_REQUESTED")).toHaveLength(1);
  });
  it("consumes a legacy link once but still requires admin approval", async () => {
    localStorage.setItem("remarket.mock.tokens", JSON.stringify({ "valid-verify-link": IDS.user(6) }));
    setCurrentUserId(null); show(<VerifyEmailPage />, "/verify-email?token=valid-verify-link&returnTo=%2Fcheckout");
    await userEvent.click(await screen.findByRole("button", { name: "Gửi yêu cầu xác minh email" }));
    expect(await screen.findByRole("heading", { name: "Trang chủ kiểm thử" })).toBeInTheDocument();
    expect(db().users.find((user) => user.id === IDS.user(6))?.email_verified_at).toBeNull();
    expect((await api.auth.emailVerificationRequest())?.status).toBe("PENDING");
    await expect(api.auth.verifyEmail("valid-verify-link")).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
  it("lets admin approve with confirmation, shows history and records a single approval", async () => {
    await api.auth.requestEmailVerification(); setCurrentUserId(IDS.user(1));
    show(<AdminEmailVerificationsPage />, "/admin/email-verifications");
    await userEvent.click(await screen.findByRole("button", { name: "Đồng ý xác minh" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/vy.moi@remarket.vn/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Đồng ý xác minh" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(await screen.findByText("Không có yêu cầu xác minh email")).toBeInTheDocument();
    await api.admin.approveEmailVerification(IDS.user(6));
    expect(db().audit_logs.filter((item) => item.action === "user.email_verified")).toHaveLength(1);
    await userEvent.selectOptions(screen.getByLabelText("Trạng thái"), "APPROVED");
    expect(await screen.findByText("vy.moi@remarket.vn")).toBeInTheDocument();
    expect(db().notifications.filter((item) => item.type === "EMAIL_VERIFIED")).toHaveLength(1);
  });
  it("blocks non-admin approval and does not verify accounts without a request", async () => {
    await expect(api.admin.approveEmailVerification(IDS.user(6))).rejects.toMatchObject({ status: 403 });
    setCurrentUserId(IDS.user(1));
    await expect(api.admin.approveEmailVerification(IDS.user(6))).rejects.toMatchObject({ status: 404 });
  });
});
