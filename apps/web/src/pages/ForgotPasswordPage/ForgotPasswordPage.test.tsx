import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
vi.mock("../../config/environment", () => ({ EMAIL_ENABLED: false }));
vi.mock("../../contexts/SessionContext", () => ({ useSession: () => ({ login: vi.fn() }) }));
vi.mock("../../services/api", () => ({ api: { auth: { forgotPassword: vi.fn() } } }));
import { ForgotPasswordPage } from "./ForgotPasswordPage";

describe("demo password reset", () => {
  it("explains that email is unavailable without promising a reset link", () => {
    render(<MemoryRouter><ForgotPasswordPage /></MemoryRouter>);
    expect(screen.getByText("Bản demo không hỗ trợ gửi email đặt lại mật khẩu.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Gửi liên kết đặt lại" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Quay lại đăng nhập/ })).toHaveAttribute("href", "/login");
  });
});
