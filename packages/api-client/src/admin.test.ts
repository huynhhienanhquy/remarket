import { describe, expect, it, vi } from "vitest";
import { adminEndpoints } from "./admin.js";
import { createTransport } from "./transport.js";

function setup(code = "VERSION_CONFLICT", status = 409) {
  const fetcher = vi.fn<typeof fetch>(
    async () =>
      new Response(
        JSON.stringify({
          success: false,
          error: { code, message: "Yêu cầu bị từ chối." },
          meta: { request_id: "test" },
        }),
        { status },
      ),
  );
  const refresh = vi.fn(async () => true);
  const api = adminEndpoints(
    createTransport({
      baseUrl: "https://api.example.test/api/v1",
      fetch: fetcher,
      getToken: () => "native-access",
      refresh,
    }),
  );
  return { api, fetcher, refresh };
}

describe("shared admin endpoints over native transport", () => {
  it("preserves the reviewed version and never retries a conflicting moderation", async () => {
    const { api, fetcher, refresh } = setup();
    await expect(
      api.rejectProduct("product-id", 7, "Ảnh không đúng sản phẩm"),
    ).rejects.toMatchObject({ code: "VERSION_CONFLICT", status: 409 });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(refresh).not.toHaveBeenCalled();
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      "https://api.example.test/api/v1/admin/products/product-id/reject",
    );
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      credentials: "omit",
      headers: { Authorization: "Bearer native-access" },
      body: JSON.stringify({
        expected_version: 7,
        reason: "Ảnh không đúng sản phẩm",
      }),
    });
  });
  it("passes support cancellation evidence and expected version unchanged", async () => {
    const { api, fetcher } = setup("FORBIDDEN", 403);
    const input = {
      expected_version: 4,
      reason: "Hai bên đã thống nhất",
      ticket_id: "ticket-id",
      delivery_outcome: "RETURNED" as const,
      payment_resolution: "Đã hoàn trả tiền mặt giữa hai bên",
    };
    await expect(api.cancelOrder("order-id", input)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[1]?.body).toBe(JSON.stringify(input));
  });
  it("encodes admin filters without dropping page or dates", async () => {
    const { api, fetcher } = setup("FORBIDDEN", 403);
    await expect(
      api.users({
        q: "Đỗ An",
        role: "USER",
        status: "LOCKED",
        page: 3,
        from: "2026-10-01",
        to: "2026-10-15",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const url = new URL(String(fetcher.mock.calls[0]?.[0]));
    expect(url.searchParams.get("q")).toBe("Đỗ An");
    expect(url.searchParams.get("page")).toBe("3");
    expect(url.searchParams.get("status")).toBe("LOCKED");
    expect(url.searchParams.get("from")).toBe("2026-10-01");
  });
});
