import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SessionProvider, useSession } from "../SessionContext";
import { api } from "../../services/api";
import { ApiError } from "../../helpers/errors";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("../../services/api", () => ({ api: { auth: { bootstrap: vi.fn() } } }));
function Probe() {
  const session = useSession();
  return <div>{session.status === "loading" ? "Đang kiểm tra" : session.viewer ? session.viewer.role : "Khách"}</div>;
}
beforeEach(() => { vi.resetAllMocks(); });
describe("session initialization", () => {
  it("does not show guest routes for a server failure and offers retry", async () => {
    vi.mocked(api.auth.bootstrap).mockRejectedValueOnce(new ApiError({ code: "RETRY_LATER", message: "Timeout", status: 409 })).mockResolvedValueOnce(null);
    render(<QueryClientProvider client={new QueryClient()}><SessionProvider><Probe /></SessionProvider></QueryClientProvider>);
    expect(await screen.findByText("Chưa thể kiểm tra phiên đăng nhập")).toBeInTheDocument();
    expect(screen.queryByText("Khách")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(await screen.findByText("Khách")).toBeInTheDocument();
    expect(api.auth.bootstrap).toHaveBeenCalledTimes(2);
  });
});
