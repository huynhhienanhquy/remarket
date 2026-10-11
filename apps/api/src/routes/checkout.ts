import type { CheckoutResult, OrderListItem } from "@remarket/shared";
import { Router } from "express";
import { z } from "zod";
import type { AuthRequest } from "../middleware/auth.js";
import { requireVerified } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { checkoutRateLimit } from "../middleware/rate-limit.js";
import { checkoutPayloadSchema, normalizePayload } from "../services/checkout-input.js";
import { runCheckoutWithRetry } from "../services/checkout-service.js";
import { ok } from "../shared/api-response.js";
import type { OrderRow } from "../shared/dto-mappers.js";
import { toOrderListItem, toSellerSummary } from "../shared/dto-mappers.js";
import {
  unauthorized,
  validationError
} from "../shared/errors.js";
import type { SellerAggregates } from "../shared/seller-aggregates.js";
import { EMPTY_AGGREGATES, loadSellerAggregates } from "../shared/seller-aggregates.js";

/**
 * POST /checkout — the transactional core (detail-project 10).
 *
 * The whole purchase runs inside one Serializable transaction: idempotency
 * find-or-create, validation, price/shipping comparison, one order per seller
 * with snapshots, conditional reservation of every product, cart cleanup,
 * seller notifications and the `SUCCEEDED` marker. Any failure rolls the whole
 * basket back, so a multi-seller checkout can never be half applied and money
 * always comes from the database — never from the client.
 */

const router = Router();

const MAX_IDEMPOTENCY_KEY_LENGTH = 128;

/** Header wins; the query param is the transitional fallback (detail-project 2). */
const checkoutQuerySchema = z
  .object({ idempotency_key: z.string().max(MAX_IDEMPOTENCY_KEY_LENGTH).optional() })
  .strict();

function readIdempotencyKey(req: AuthRequest): string {
  const query = checkoutQuerySchema.parse(req.query);
  const header = req.headers["idempotency-key"];
  const fromHeader = Array.isArray(header) ? header[0] : header;
  const fromQuery = query.idempotency_key ?? "";
  const key = (fromHeader ?? fromQuery).trim();
  if (key === "") {
    throw validationError("Thiếu mã idempotency cho yêu cầu đặt hàng.", {
      idempotency_key: "Bắt buộc.",
    });
  }
  if (key.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
    throw validationError("Mã idempotency quá dài.", {
      idempotency_key: `Tối đa ${MAX_IDEMPOTENCY_KEY_LENGTH} ký tự.`,
    });
  }
  return key;
}

/** `RM-XXXXXXXX` is unique; collisions are astronomically rare but never assumed. */

/* ------------------------------------------------------------------ *
 * Transaction (detail-project 10.2)
 * ------------------------------------------------------------------ */

/** Serializable conflicts and unique races get exactly one retry (detail-project 10.2). */

function toCheckoutOrders(
  rows: OrderRow[],
  aggregates: ReadonlyMap<string, SellerAggregates>,
): OrderListItem[] {
  return rows.map((row) => {
    const base = toOrderListItem(row, row.buyerId);
    return {
      ...base,
      counterparty: toSellerSummary(row.seller, aggregates.get(row.sellerId) ?? EMPTY_AGGREGATES),
    };
  });
}

/* ------------------------------------------------------------------ *
 * POST /api/v1/checkout
 * ------------------------------------------------------------------ */

router.post(
  "/",
  checkoutRateLimit,
  requireVerified,
  asyncHandler(async (req: AuthRequest, res) => {
    if (!req.user) throw unauthorized();
    const buyerId = req.user.id;

    const idempotencyKey = readIdempotencyKey(req);
    const payload = checkoutPayloadSchema.parse(req.body);
    const normalized = normalizePayload(payload);

    const outcome = await runCheckoutWithRetry(
      buyerId,
      idempotencyKey,
      normalized.hash,
      normalized,
    );

    const aggregates = await loadSellerAggregates(outcome.rows.map((row) => row.sellerId));
    const data: CheckoutResult = {
      checkout_request_id: outcome.checkoutRequestId,
      orders: toCheckoutOrders(outcome.rows, aggregates),
    };
    ok(res, data, 201);
  }),
);

export { router as checkoutRouter };

export { normalizePayload } from "../services/checkout-input.js";
