import { useEffect, useState } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { SessionUser } from "@remarket/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryClient } from "../../config/queryClient";
import { http, SESSION_COOKIE_CHANGED_EVENT, subscribeAccessToken } from "../../services/http";
import { SessionProvider, useSession } from "../SessionContext";

vi.mock("../../services/api", async () => {
  const { createHttpAdapter } = await import("../../services/httpAdapter");
  return { api: createHttpAdapter() };
});

const user: SessionUser = {
  id: "resume-user", full_name: "Người kiểm thử", email: "resume@example.test", role: "USER", status: "ACTIVE",
  avatar_url: null, phone: null, province_code: null, default_address: null,
  joined_at: "2026-10-01T00:00:00Z", email_verified_at: "2026-10-01T00:00:00Z",
};
const ok = (data: unknown) => new Response(JSON.stringify({ meta: { request_id: "resume-test" }, success: true, data }));
const denied = (status: number) => new Response(JSON.stringify({ success: false, error: { code: `HTTP_${status}`, message: "Unavailable" } }), { status });
let client: ReturnType<typeof createQueryClient>;
let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;
let mounts: number;

function Probe() {
  const { viewer, status } = useSession();
  const [draft, setDraft] = useState("");
  useEffect(() => { mounts += 1; }, []);
  return <div>
    <div>{status === "loading" ? "Loading" : viewer?.id ?? "Guest"}</div>
    <input aria-label="Draft" value={draft} onChange={(event) => setDraft(event.target.value)} />
  </div>;
}

async function mount() {
  render(<QueryClientProvider client={client}><SessionProvider><Probe /></SessionProvider></QueryClientProvider>);
  await screen.findByText(user.id);
  client.setQueryData(["products", "cached"], { title: "Cached product" });
  fireEvent.change(screen.getByLabelText("Draft"), { target: { value: "Nội dung đang nhập" } });
}

beforeEach(() => {
  http.setAccessToken(null);
  mounts = 0;
  client = createQueryClient();
  fetchMock = vi.fn<typeof fetch>(async (url) => String(url).includes("/auth/bootstrap")
    ? ok({ user, access_token: "original-token" }) : ok(user));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  client.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("browser tab resume", () => {
  it("keeps the page, draft, cache and token while checking identity in the background", async () => {
    await mount();
    let finish!: (response: Response) => void;
    fetchMock.mockImplementation(() => new Promise<Response>((resolve) => { finish = resolve; }));
    const tokenChanged = vi.fn();
    const unsubscribe = subscribeAccessToken(tokenChanged);
    try {
      fireEvent(window, new Event("focus"));
      fireEvent(document, new Event("visibilitychange"));
      expect(screen.getByLabelText("Draft")).toBeVisible();
      expect(screen.getByLabelText("Draft")).toHaveValue("Nội dung đang nhập");
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(String(fetchMock.mock.calls[1]?.[0])).toContain("/auth/me");
      await act(async () => { finish(ok(user)); });
      expect(mounts).toBe(1);
      expect(client.getQueryData(["products", "cached"])).toEqual({ title: "Cached product" });
      expect(http.getAccessToken()).toBe("original-token");
      expect(tokenChanged).not.toHaveBeenCalled();
    } finally { unsubscribe(); }
  });

  it("does not reset the page or cache after a transient background failure", async () => {
    await mount();
    fetchMock.mockResolvedValueOnce(denied(503));
    await act(async () => { fireEvent(window, new Event("focus")); });
    expect(screen.getByLabelText("Draft")).toBeVisible();
    expect(screen.getByLabelText("Draft")).toHaveValue("Nội dung đang nhập");
    expect(client.getQueryData(["products", "cached"])).toBeDefined();
    expect(screen.queryByText("Chưa thể kiểm tra phiên đăng nhập")).not.toBeInTheDocument();
    await act(async () => { fireEvent(window, new Event("online")); });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(mounts).toBe(1);
  });

  it("clears private cache when the server reports changed permissions", async () => {
    await mount();
    fetchMock.mockResolvedValueOnce(ok({ ...user, status: "LOCKED" }));
    await act(async () => { fireEvent(window, new Event("focus")); });
    expect(client.getQueryData(["products", "cached"])).toBeUndefined();
  });

  it("refreshes an expired token without resetting the page", async () => {
    await mount();
    fetchMock.mockImplementation(async (url, options) => {
      if (String(url).includes("/auth/refresh")) return ok({ user, access_token: "fresh-token" });
      return new Headers(options?.headers).get("Authorization") === "Bearer fresh-token" ? ok(user) : denied(401);
    });
    await act(async () => { fireEvent(window, new Event("focus")); });
    expect(http.getAccessToken()).toBe("fresh-token");
    expect(screen.getByLabelText("Draft")).toHaveValue("Nội dung đang nhập");
    expect(client.getQueryData(["products", "cached"])).toBeDefined();
    expect(mounts).toBe(1);
  });

  it("clears identity and private cache when the session has expired", async () => {
    await mount();
    fetchMock.mockResolvedValue(denied(401));
    await act(async () => { fireEvent(window, new Event("focus")); });
    await screen.findByText("Guest");
    expect(http.getAccessToken()).toBeNull();
    expect(client.getQueryData(["products", "cached"])).toBeUndefined();
  });

  it("still suspends content when a known cookie change requires session discovery", async () => {
    await mount();
    let finish!: (response: Response) => void;
    fetchMock.mockImplementation(() => new Promise<Response>((resolve) => { finish = resolve; }));
    fireEvent(window, new Event(SESSION_COOKIE_CHANGED_EVENT));
    expect(screen.getByLabelText("Draft")).not.toBeVisible();
    await waitFor(() => expect(String(fetchMock.mock.calls[1]?.[0])).toContain("/auth/bootstrap"));
    await act(async () => { finish(ok({ user, access_token: "restored-token" })); });
    expect(screen.getByLabelText("Draft")).toBeVisible();
    expect(screen.getByLabelText("Draft")).toHaveValue("Nội dung đang nhập");
    expect(mounts).toBe(1);
  });
});
