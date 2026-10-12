import type { Prisma } from "@prisma/client";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/app.js";
import { env } from "../../src/config/env.js";
import { createEmailToken } from "../../src/services/email-tokens.js";
import { deliverAuthEmail } from "../../src/services/email.js";
import { prisma } from "../../src/utils/prisma.js";

const original = env.emailEnabled;
afterEach(() => {
  Object.defineProperty(env, "emailEnabled", { value: original, configurable: true });
  vi.restoreAllMocks();
});
function disableEmail() {
  Object.defineProperty(env, "emailEnabled", { value: false, configurable: true });
}
describe("explicit demo email opt-out", () => {
  it.each(["forgot-password", "resend-verification"])("rejects %s uniformly before user lookup", async (route) => {
    disableEmail();
    const lookup = vi.spyOn(prisma.user, "findUnique");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await request(createApp()).post(`/api/v1/auth/${route}`).send({ email: "demo@example.test" }).expect(503);
    expect(response.body.error.code).toBe("EMAIL_DISABLED");
    expect(lookup).not.toHaveBeenCalled();
  });
  it("does not issue email tokens or queue mail during registration", async () => {
    disableEmail();
    const updateMany = vi.fn(), create = vi.fn();
    const tx = { authToken: { updateMany, create } } as unknown as Prisma.TransactionClient;
    await createEmailToken(tx, { userId: "demo", recipient: "demo@example.test", purpose: "VERIFY_EMAIL", ttlMs: 1000, token: "never-logged" });
    expect(updateMany).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });
  it("skips pending mail without decrypting or logging its payload", async () => {
    disableEmail();
    const output = vi.spyOn(console, "log");
    await deliverAuthEmail({ eventType: "email.auth", aggregateId: "demo", payload: { sealed_token: "invalid-secret" } });
    expect(output).not.toHaveBeenCalled();
  });
});
