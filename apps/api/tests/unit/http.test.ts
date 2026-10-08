import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/app.js";

describe("HTTP foundation", () => {
  it("exposes a liveness probe without touching the database", async () => {
    const response = await request(createApp()).get("/health/live").expect(200);
    expect(response.body).toEqual({ status: "ok", live: true });
    expect(response.headers["x-request-id"]).toBeTruthy();
  });

  it("uses the standard error envelope for unknown endpoints", async () => {
    const response = await request(createApp()).get("/api/v1/no-such-route").expect(404);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe("NOT_FOUND");
    expect(response.body.meta.request_id).toBe(response.headers["x-request-id"]);
  });

  it("correlates validation logs without logging the request payload", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      await request(createApp())
        .post("/api/v1/auth/login")
        .set("X-Request-Id", "contract-validation-1")
        .send({ password: "do-not-log-this-password" })
        .expect(422);

      const output = warn.mock.calls.flat().join(" ");
      expect(output).toContain("request_id=contract-validation-1");
      expect(output).not.toContain("do-not-log-this-password");
    } finally {
      warn.mockRestore();
    }
  });

  it("rejects unknown and malformed public-list query parameters before database access", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const unknown = await request(createApp())
        .get("/api/v1/products?unexpected=1")
        .expect(422);
      expect(unknown.body.error.code).toBe("VALIDATION_ERROR");

      const malformed = await request(createApp())
        .get("/api/v1/products?page=1.5")
        .expect(422);
      expect(malformed.body.error.details.fields.page).toBeTruthy();
    } finally {
      warn.mockRestore();
    }
  });
});
