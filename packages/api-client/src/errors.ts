import type { ApiErrorCode } from "@remarket/shared";
export class ApiError extends Error {
  readonly code: ApiErrorCode | string;
  readonly status: number;
  readonly details: Record<string, unknown> | undefined;
  readonly requestId: string | undefined;
  /** Field-level messages for 422 responses, keyed by field name. */
  readonly fields: Record<string, string> | undefined;

  constructor(init: {
    code: ApiErrorCode | string;
    message: string;
    status: number;
    details?: Record<string, unknown>;
    requestId?: string;
    fields?: Record<string, string>;
  }) {
    super(init.message);
    this.name = "ApiError";
    this.code = init.code;
    this.status = init.status;
    this.details = init.details;
    this.requestId = init.requestId;
    this.fields = init.fields;
  }

  is(code: ApiErrorCode | string): boolean {
    return this.code === code;
  }

  /** Network failures are not HTTP responses; they get their own branch. */
  get isNetwork(): boolean {
    return this.code === "NETWORK_ERROR";
  }
}

function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

/** Error envelopes can also come from proxies and old API deployments. */
export function apiErrorFromResponse(status: number, payload: unknown, fallbackMessage: string): ApiError {
  const envelope = object(payload);
  const error = object(envelope?.error);
  const meta = object(envelope?.meta);
  const details = object(error?.details);
  const fields = object(details?.fields);
  const messages = Object.entries(fields ?? {}).flatMap(([key, message]) =>
    typeof message === "string" && message !== "" ? [[key, message] as const] : []);
  return new ApiError({
    code: typeof error?.code === "string" ? error.code : `HTTP_${status}`,
    message: typeof error?.message === "string" ? error.message : fallbackMessage,
    status,
    details,
    requestId: typeof meta?.request_id === "string" ? meta.request_id : undefined,
    fields: messages.length ? Object.fromEntries(messages) : undefined,
  });
}
