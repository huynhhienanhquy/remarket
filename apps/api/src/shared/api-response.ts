import type { Response } from "express";
import type { ApiMeta, PageMeta } from "@remarket/shared";

/**
 * Request ID detail-project 4.1.
 * The request ID is set by the requestIdMiddleware (res.locals.requestId)
 * and used by envelopeMeta so the body request_id matches the X-Request-Id header.
 */

/** Get request ID from response locals (set by requestIdMiddleware). */
function envelopeMetaFromRes(res: Response): ApiMeta {
  const id = res.locals.requestId as unknown;
  return { request_id: typeof id === "string" && id !== "" ? id : crypto.randomUUID() };
}

/**
 * Response envelope (detail-project 4). Every success body is
 * `{ success, data, meta }`; list bodies nest `{ items, meta }` inside `data`
 * because that is the shape `ApiAdapter` already consumes.
 */

export function envelopeMeta(res: Response, extra?: Partial<ApiMeta>): ApiMeta {
  return { ...envelopeMetaFromRes(res), ...extra };
}

export function ok<T>(res: Response, data: T, status = 200): Response {
  return res.status(status).json({ success: true, data, meta: envelopeMeta(res) });
}

export function okList<T>(
  res: Response,
  items: T[],
  page: PageMeta,
  status = 200,
): Response {
  return res.status(status).json({
    success: true,
    data: { items, meta: page },
    meta: envelopeMeta(res, { page: page.page, page_size: page.page_size, total: page.total, total_pages: page.total_pages }),
  });
}

export function noContent(res: Response): Response {
  return res.status(204).send();
}
