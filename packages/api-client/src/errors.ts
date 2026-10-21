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
