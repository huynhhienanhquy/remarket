import { randomUUID } from "node:crypto";
import type { Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { RateQuota } from "../../src/services/rate-quota.js";
import { chatRateLimit } from "../../src/middleware/rate-limit.js";
import { assertSocketMessageRateLimit } from "../../src/realtime/server.js";
import type { AuthRequest } from "../../src/middleware/auth.js";

describe("shared transport quota", () => {
  it("evicts single-use expired identities on a new user's first message", () => {
    const quota = new RateQuota(60_000, 30);
    for (let id = 0; id < 10_002; id++) quota.consume(String(id), 1);
    quota.consume("new-user", 120_001);
    expect(quota.size).toBe(1);
  });
  it("shares the action budget and reopens slots as their timestamps expire", () => {
    const id = randomUUID(), next = vi.fn();
    const req = { user: { id }, headers: {}, socket: {}, ip: "127.0.0.1" } as AuthRequest;
    const response = { locals: {}, setHeader: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn() };
    const clock = vi.spyOn(Date, "now").mockReturnValue(1);
    try {
      for (let count = 0; count < 15; count++) chatRateLimit(req, response as unknown as Response, next);
      expect(next).toHaveBeenCalledTimes(15);
      clock.mockReturnValue(2);
      for (let count = 0; count < 15; count++) assertSocketMessageRateLimit(id);
      chatRateLimit(req, response as unknown as Response, next);
      expect(next).toHaveBeenCalledTimes(15);
      expect(response.status).toHaveBeenCalledWith(429);
      expect(() => assertSocketMessageRateLimit(id)).toThrow(/thao tác quá nhanh/);
      clock.mockReturnValue(60_001);
      chatRateLimit(req, response as unknown as Response, next);
      expect(next).toHaveBeenCalledTimes(16);
      expect(response.setHeader).toHaveBeenLastCalledWith("RateLimit-Reset", 1);
    } finally { clock.mockRestore(); }
  });
});
