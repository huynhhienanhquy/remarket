import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@remarket/shared";
import { SessionProvider, useSession } from "../SessionContext";
import { api } from "../../services/api";

vi.mock("../../services/api", () => ({ api: { auth: { bootstrap: vi.fn(), me: vi.fn() } } }));
const user: SessionUser = {
  id: "unverified-session", full_name: "Người kiểm thử", email: "own@example.test", role: "USER", status: "ACTIVE",
  avatar_url: null, phone: null, province_code: null, default_address: null, email_verified_at: null, joined_at: "2026-10-01T00:00:00Z",
};
function Probe() {
  const { viewer } = useSession();
  return <div>{viewer ? viewer.email_verified_at ? "Đã xác minh" : "Đang chờ admin" : "Khách"}</div>;
}
async function mount() {
  await act(async () => { render(<QueryClientProvider client={new QueryClient()}><SessionProvider><Probe /></SessionProvider></QueryClientProvider>); });
}
beforeEach(() => { vi.resetAllMocks(); vi.useFakeTimers(); vi.mocked(api.auth.bootstrap).mockResolvedValue(user); });
afterEach(() => { cleanup(); vi.useRealTimers(); });
describe("email approval REST session fallback", () => {
  it("updates capabilities without a reload and stops polling once verified", async () => {
    vi.mocked(api.auth.me).mockResolvedValue({ ...user, email_verified_at: "2026-10-08T00:00:00Z" });
    await mount(); expect(screen.getByText("Đang chờ admin")).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
    expect(screen.getByText("Đã xác minh")).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(30000); });
    expect(api.auth.me).toHaveBeenCalledTimes(1);
  });
  it("keeps the signed-in viewer after a network failure and retries later", async () => {
    vi.mocked(api.auth.me).mockRejectedValueOnce(new Error("offline")).mockResolvedValue(user);
    await mount(); await act(async () => { await vi.advanceTimersByTimeAsync(30000); });
    expect(screen.getByText("Đang chờ admin")).toBeInTheDocument();
    expect(api.auth.me).toHaveBeenCalledTimes(2);
  });
  it("does not overlap identity checks while a response is pending", async () => {
    vi.mocked(api.auth.me).mockImplementation(() => new Promise(() => {}));
    await mount(); await act(async () => { await vi.advanceTimersByTimeAsync(45000); });
    expect(api.auth.me).toHaveBeenCalledTimes(1);
  });
});
