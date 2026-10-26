import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionProvider, useSession } from "../SessionContext";
import { api } from "../../services/api";
import { member } from "../../tests/test-data";

vi.mock("../../services/api", () => ({ api: { auth: { bootstrap: vi.fn(), me: vi.fn() } } }));
function Probe() {
  const { viewer } = useSession();
  return <div>{viewer?.email_verified_at ? "Đã xác minh" : "Đang chờ admin"}</div>;
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.mocked(api.auth.bootstrap).mockResolvedValue({ ...member, email_verified_at: null });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("page-scoped email verification", () => {
  it("does not poll identity on unrelated pages for an unverified user", async () => {
    const client = new QueryClient();
    await act(async () => {
      render(<QueryClientProvider client={client}><SessionProvider><Probe /></SessionProvider></QueryClientProvider>);
    });
    expect(screen.getByText("Đang chờ admin")).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(90_000); });
    expect(api.auth.bootstrap).toHaveBeenCalledTimes(1);
    expect(api.auth.me).not.toHaveBeenCalled();
    client.clear();
  });
});
