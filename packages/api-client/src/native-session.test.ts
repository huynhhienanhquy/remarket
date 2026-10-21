import { describe, expect, it, vi } from "vitest";
import { NativeSession } from "./native-session.js";
import { ApiError } from "./errors.js";
import type { HttpTransport } from "./transport.js";
import type { SessionUser } from "@remarket/shared";

const user: SessionUser = {
  id: "user-a",
  full_name: "User A",
  email: "a@example.test",
  role: "USER",
  status: "ACTIVE",
  email_verified_at: null,
  phone: null,
  province_code: null,
  default_address: null,
  avatar_url: null,
  joined_at: "2026-10-14T00:00:00Z",
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function setup() {
  let token: string | null = "persisted-refresh";
  const store = {
    read: vi.fn(async () => token),
    write: vi.fn(async (value: string) => {
      token = value;
    }),
    clear: vi.fn(async () => {
      token = null;
    }),
  };
  const post = vi.fn().mockResolvedValue({
    user,
    access_token: "access",
    refresh_token: "new-refresh",
  });
  const http = { post, get: vi.fn() } as unknown as HttpTransport;
  return {
    session: new NativeSession(http, store),
    store,
    post,
    token: () => token,
  };
}
describe("native credential lifecycle", () => {
  it("invalidates in-flight private work when the same account's permissions change", async () => {
    const ctx = setup();
    await ctx.session.restore();
    const generation = ctx.session.getGeneration();
    ctx.post.mockResolvedValue({
      user: { ...user, status: "LOCKED" },
      access_token: "fresh-access",
    });
    await ctx.session.restore();
    expect(ctx.session.getGeneration()).toBeGreaterThan(generation);
    expect(ctx.session.getSnapshot().user?.status).toBe("LOCKED");
    expect(ctx.token()).toBe("persisted-refresh");
  });
  it("revokes the previous native session before switching accounts", async () => {
    const ctx = setup();
    await ctx.session.restore();
    ctx.post.mockClear();
    await ctx.session.login("other@example.test", "password");
    expect(ctx.post.mock.calls[0]?.[0]).toBe("/auth/mobile/logout");
    expect(ctx.post.mock.calls[0]?.[1]).toEqual({
      refresh_token: "persisted-refresh",
    });
    expect(ctx.post.mock.calls[1]?.[0]).toBe("/auth/mobile/login");
  });
  it("preserves persisted credentials when discovery returns an inconsistent user/token pair", async () => {
    const ctx = setup();
    ctx.post.mockResolvedValue({ user, access_token: null });
    await expect(ctx.session.restore()).rejects.toMatchObject({
      code: "INVALID_AUTH_RESPONSE",
    });
    expect(ctx.token()).toBe("persisted-refresh");
    expect(ctx.store.clear).not.toHaveBeenCalled();
  });
  it("discovers persisted credentials without rotating or rewriting the refresh token", async () => {
    const ctx = setup();
    await ctx.session.restore();
    expect(ctx.post).toHaveBeenCalledWith("/auth/mobile/bootstrap", {
      refresh_token: "persisted-refresh",
    });
    expect(ctx.store.write).not.toHaveBeenCalled();
    expect(ctx.session.getSnapshot().user?.id).toBe(user.id);
  });
  it("shares one refresh between simultaneous REST and socket recovery", async () => {
    const ctx = setup();
    await ctx.session.restore();
    ctx.post.mockClear();
    const pending = deferred<{
      user: SessionUser;
      access_token: string;
      refresh_token: string;
    }>();
    ctx.post.mockReturnValue(pending.promise);
    const first = ctx.session.refresh();
    const second = ctx.session.refresh();
    expect(first).toBe(second);
    pending.resolve({
      user,
      access_token: "rotated-access",
      refresh_token: "rotated-refresh",
    });
    await first;
    expect(ctx.post).toHaveBeenCalledTimes(1);
    expect(ctx.token()).toBe("rotated-refresh");
    expect(ctx.session.getToken()).toBe("rotated-access");
  });
  it("cannot restore a login response that arrives after logout", async () => {
    const ctx = setup();
    const pending = deferred<{
      user: SessionUser;
      access_token: string;
      refresh_token: string;
    }>();
    ctx.post.mockReturnValue(pending.promise);
    const login = ctx.session.login(user.email, "password");
    await Promise.resolve();
    await Promise.resolve();
    await ctx.session.expire();
    pending.resolve({
      user,
      access_token: "late",
      refresh_token: "late-refresh",
    });
    await expect(login).rejects.toMatchObject({ code: "SESSION_CHANGED" });
    expect(ctx.token()).toBeNull();
    expect(ctx.session.getToken()).toBeNull();
  });
  it("keeps the persisted credential when discovery fails due to the network", async () => {
    const ctx = setup();
    ctx.post.mockRejectedValue(
      new ApiError({ code: "NETWORK_ERROR", message: "offline", status: 0 }),
    );
    await expect(ctx.session.restore()).rejects.toMatchObject({
      code: "NETWORK_ERROR",
    });
    expect(ctx.token()).toBe("persisted-refresh");
    expect(ctx.store.clear).not.toHaveBeenCalled();
  });
  it("clears revoked credentials on a terminal refresh response", async () => {
    const ctx = setup();
    ctx.post.mockRejectedValue(
      new ApiError({
        code: "SESSION_EXPIRED",
        message: "expired",
        status: 401,
      }),
    );
    expect(await ctx.session.restore()).toBe(false);
    expect(ctx.token()).toBeNull();
  });
  it("does not publish a session if SecureStore cannot save its refresh credential", async () => {
    const ctx = setup();
    ctx.store.write.mockRejectedValue(new Error("storage unavailable"));
    await expect(ctx.session.login(user.email, "password")).rejects.toThrow(
      "storage unavailable",
    );
    expect(ctx.session.getToken()).toBeNull();
    expect(ctx.session.getSnapshot().user).toBeNull();
  });
});
