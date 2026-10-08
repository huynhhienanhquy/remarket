import express from "express";
import request from "supertest";
import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { errorHandler } from "../../src/middleware/errorHandler.js";
import { isTransactionConflict } from "../../src/shared/database-errors.js";

describe("PostgreSQL transaction conflict mapping", () => {
  it.each(["40001", "40P01"])("maps raw PostgreSQL %s to retryable conflict instead of INTERNAL", async (code) => {
    const error = new Prisma.PrismaClientKnownRequestError("raw lock conflict", { code: "P2010", clientVersion: "5.22.0", meta: { code } });
    expect(isTransactionConflict(error)).toBe(true);
    const app = express(); app.get("/", (_req, _res, next) => next(error)); app.use(errorHandler);
    const response = await request(app).get("/").expect(409);
    expect(response.body.error.code).toBe("RETRY_LATER");
  });
  it("does not treat arbitrary raw SQL errors as transaction conflicts", () => {
    expect(isTransactionConflict(new Prisma.PrismaClientKnownRequestError("syntax error", { code: "P2010", clientVersion: "5.22.0", meta: { code: "42601" } }))).toBe(false);
  });
});
