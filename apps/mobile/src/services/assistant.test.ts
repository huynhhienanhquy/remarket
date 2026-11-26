import { beforeEach, describe, expect, it, vi } from "vitest";
import { fromByteArray } from "base64-js";
import { assistantHeaders } from "./assistant";
import { session } from "./runtime";

vi.mock("./session-context", () => ({ useSession: vi.fn() }));
vi.mock("./runtime", () => ({
  session: {
    getGeneration: vi.fn(),
    getSnapshot: vi.fn(),
    getToken: vi.fn(),
    refresh: vi.fn(),
  },
}));

describe("assistant bearer headers", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(session.getGeneration).mockReturnValue(1);
    vi.mocked(session.getSnapshot).mockReturnValue({
      user: { status: "ACTIVE" } as ReturnType<typeof session.getSnapshot>["user"],
      loading: false,
      error: null,
    });
  });

  it("refreshes an expiring token and sends the rotated bearer", async () => {
    const encoded = new TextEncoder().encode(JSON.stringify({ exp: Math.floor(Date.now() / 1_000) }));
    const payload = fromByteArray(encoded).replace(/=+$/, "");
    vi.mocked(session.getToken).mockReturnValueOnce(`header.${payload}.signature`).mockReturnValue("rotated");
    vi.mocked(session.refresh).mockResolvedValue(true);
    await expect(assistantHeaders(1)).resolves.toEqual({ Authorization: "Bearer rotated" });
    expect(session.refresh).toHaveBeenCalledOnce();
  });

  it("rejects a token from a different session when the account changes during refresh", async () => {
    vi.mocked(session.getToken).mockReturnValueOnce(null).mockReturnValue("other-session");
    vi.mocked(session.refresh).mockImplementation(async () => {
      vi.mocked(session.getGeneration).mockReturnValue(2);
      return true;
    });
    await expect(assistantHeaders(1)).rejects.toThrow("Phiên đăng nhập đã thay đổi.");
    expect(session.getToken).toHaveBeenCalledOnce();
  });
});
