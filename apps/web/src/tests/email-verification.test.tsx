import { QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { EmailVerificationRequest } from "@remarket/shared";
import { SessionProvider } from "../contexts/SessionContext";
import { ToastProvider } from "../components/common";
import { createQueryClient } from "../config/queryClient";
import { VerifyEmailPage } from "../pages/VerifyEmailPage/VerifyEmailPage";
import { AdminEmailVerificationsPage } from "../pages/AdminEmailVerificationsPage/AdminEmailVerificationsPage";
import { api } from "../services/api";
import { failure, httpContext, page } from "./http-context";
import { member, timestamp } from "./test-data";

let context: ReturnType<typeof httpContext>;
const clients: ReturnType<typeof createQueryClient>[] = [];
const request: EmailVerificationRequest = {
  id: member.id, user: { id: member.id, full_name: member.full_name, email: member.email, status: "ACTIVE" },
  status: "PENDING", requested_at: timestamp, approved_at: null,
};
function show(element: ReactNode, path: string) {
  const client = createQueryClient();
  clients.push(client);
  client.setDefaultOptions({ queries: { retry: false }, mutations: { retry: false } });
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><SessionProvider><ToastProvider><Routes>
    <Route path={path.split("?")[0]} element={element} />
    <Route path="/" element={<h1>Trang chủ kiểm thử</h1>} />
  </Routes></ToastProvider></SessionProvider></MemoryRouter></QueryClientProvider>);
}
beforeEach(() => {
  context = httpContext({ ...member, email_verified_at: null });
  context.reply("GET", "/auth/email-verification-request", null);
  context.reply("POST", "/auth/email-verification-request", request);
});
afterEach(() => { for (const client of clients.splice(0)) client.clear(); vi.unstubAllGlobals(); });

describe("email verification through the HTTP adapter", () => {
  it("submits only the signed-in email and returns home while approval is pending", async () => {
    show(<VerifyEmailPage />, "/verify-email?email=other@example.test&returnTo=%2Fcheckout");
    expect(await screen.findByLabelText("Email tài khoản")).toHaveValue(member.email);
    expect(screen.getByLabelText("Email tài khoản")).toHaveAttribute("readonly");
    await userEvent.click(await screen.findByRole("button", { name: "Gửi yêu cầu xác minh email" }));
    expect(await screen.findByRole("heading", { name: "Trang chủ kiểm thử" })).toBeInTheDocument();
    expect(context.requests("POST", "/auth/email-verification-request")[0]?.body).toEqual({});
    expect(context.viewer?.email_verified_at).toBeNull();
  });
  it("requires login before sending a request", async () => {
    context.viewer = null;
    show(<VerifyEmailPage />, "/verify-email?email=other@example.test");
    expect(await screen.findByRole("link", { name: "Đăng nhập để xác minh email" })).toHaveAttribute("href", "/login?returnTo=%2Fverify-email");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(context.requests("POST", "/auth/email-verification-request")).toHaveLength(0);
  });
  it("keeps a failed request on the page and supports a deliberate retry", async () => {
    context.on("POST", "/auth/email-verification-request", () => {
      if (context.requests("POST", "/auth/email-verification-request").length === 1) throw new Error("Mất mạng kiểm thử");
      return request;
    });
    show(<VerifyEmailPage />, "/verify-email");
    await userEvent.click(await screen.findByRole("button", { name: "Gửi yêu cầu xác minh email" }));
    expect(await screen.findByText("Chưa thể gửi yêu cầu")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Gửi yêu cầu xác minh email" }));
    expect(await screen.findByRole("heading", { name: "Trang chủ kiểm thử" })).toBeInTheDocument();
    expect(context.requests("POST", "/auth/email-verification-request")).toHaveLength(2);
  });
  it("shows the pending request without offering duplicate submission", async () => {
    context.reply("GET", "/auth/email-verification-request", request);
    show(<VerifyEmailPage />, "/verify-email");
    expect(await screen.findByText("Yêu cầu đang chờ admin duyệt")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Gửi yêu cầu xác minh email" })).not.toBeInTheDocument();
    expect(context.requests("POST", "/auth/email-verification-request")).toHaveLength(0);
  });
  it("submits a legacy token once and refreshes the still-unverified identity", async () => {
    context.viewer = null;
    context.on("POST", "/auth/verify-email", () => {
      context.viewer = { ...member, email_verified_at: null };
      return { access_token: "legacy-test-access", user: context.viewer };
    });
    show(<VerifyEmailPage />, "/verify-email?token=valid-test-link&returnTo=%2Fcheckout");
    await userEvent.click(await screen.findByRole("button", { name: "Gửi yêu cầu xác minh email" }));
    expect(await screen.findByRole("heading", { name: "Trang chủ kiểm thử" })).toBeInTheDocument();
    expect(context.requests("POST", "/auth/verify-email")).toHaveLength(1);
    expect(context.requests("POST", "/auth/verify-email")[0]?.body).toEqual({ token: "valid-test-link" });
    expect(context.requests("GET", "/auth/me")).toHaveLength(0);
    await act(async () => {
      expect(await api.auth.me()).toMatchObject({ email_verified_at: null });
    });
  });
  it("confirms admin approval and reloads pending and approved lists", async () => {
    context.viewer = { ...member, id: "admin-test", role: "ADMIN" };
    let approved = false;
    context.on("GET", "/admin/email-verifications", ({ url }) => page(url.searchParams.get("status") === "APPROVED"
      ? approved ? [{ ...request, status: "APPROVED", approved_at: timestamp }] : []
      : approved ? [] : [request]));
    context.on("POST", "/admin/email-verifications/" + member.id + "/approve", () => {
      approved = true; return { ...request, status: "APPROVED", approved_at: timestamp };
    });
    show(<AdminEmailVerificationsPage />, "/admin/email-verifications");
    await userEvent.click(await screen.findByRole("button", { name: "Đồng ý xác minh" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(new RegExp(member.email))).toBeInTheDocument();
    expect(context.requests("POST", "/admin/email-verifications/" + member.id + "/approve")).toHaveLength(0);
    await userEvent.click(within(dialog).getByRole("button", { name: "Đồng ý xác minh" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(await screen.findByText("Không có yêu cầu xác minh email")).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText("Trạng thái"), "APPROVED");
    expect(await screen.findByText(member.email)).toBeInTheDocument();
    expect(context.requests("POST", "/admin/email-verifications/" + member.id + "/approve")).toHaveLength(1);
  });
  it("surfaces forbidden and missing-request responses without reporting approval", async () => {
    context.reply("POST", "/admin/email-verifications/" + member.id + "/approve", failure(403, "FORBIDDEN"));
    await expect(api.admin.approveEmailVerification(member.id)).rejects.toMatchObject({ status: 403 });
    context.reply("POST", "/admin/email-verifications/" + member.id + "/approve", failure(404, "NOT_FOUND"));
    await expect(api.admin.approveEmailVerification(member.id)).rejects.toMatchObject({ status: 404 });
  });
});
