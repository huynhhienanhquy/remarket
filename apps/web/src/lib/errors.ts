import { API_ERROR_CODES } from "@remarket/shared";
import type { ApiErrorCode } from "@remarket/shared";

/**
 * Normalized error for both adapters. UI branches on `code`/`status` instead of
 * parsing messages, so copy can change without breaking behaviour (ui-spec 24).
 */
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

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

/** True for errors where retrying the same request cannot help (ui-spec 24). */
export function isNonRetryable(error: unknown): boolean {
  if (!isApiError(error)) return false;
  if (error.isNetwork) return false;
  return error.status < 500 && error.status !== 429;
}

export function networkError(message = "Không thể kết nối máy chủ."): ApiError {
  return new ApiError({
    code: "NETWORK_ERROR",
    message,
    status: 0,
  });
}

export function unauthorizedError(
  message = "Phiên đăng nhập đã hết hạn.",
): ApiError {
  return new ApiError({
    code: API_ERROR_CODES.UNAUTHORIZED,
    message,
    status: 401,
  });
}

/**
 * Field messages of a 422 response, keyed by field name. The live transport
 * lifts `details.fields` into `ApiError.fields`, while the mock adapter only
 * puts them in `details`, so both shapes are read here (ui-spec 24).
 */
export function apiFieldErrors(error: unknown): Record<string, string> | undefined {
  if (!isApiError(error)) return undefined;
  if (error.fields !== undefined) return error.fields;

  const fields = error.details?.fields;
  if (fields === null || typeof fields !== "object") return undefined;

  const collected: Record<string, string> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (typeof value === "string") collected[key] = value;
  }
  return Object.keys(collected).length > 0 ? collected : undefined;
}

/** Human copy for each API error code; the server message wins when present. */
export function errorTitle(error: unknown): string {
  if (!isApiError(error)) return "Có lỗi xảy ra.";
  switch (error.code) {
    case API_ERROR_CODES.VALIDATION_ERROR:
      return "Dữ liệu chưa hợp lệ";
    case API_ERROR_CODES.UNAUTHORIZED:
      return "Phiên đăng nhập chưa hợp lệ";
    case API_ERROR_CODES.FORBIDDEN:
      return "Bạn không có quyền thực hiện thao tác này";
    case API_ERROR_CODES.EMAIL_NOT_VERIFIED:
      return "Email chưa được xác minh";
    case API_ERROR_CODES.ACCOUNT_LOCKED:
      return "Tài khoản đang bị hạn chế";
    case API_ERROR_CODES.NOT_FOUND:
      return "Không tìm thấy nội dung này";
    case API_ERROR_CODES.PRODUCT_NOT_AVAILABLE:
      return "Món đồ không còn khả dụng";
    case API_ERROR_CODES.PRICE_CHANGED:
      return "Giá hoặc phí vừa thay đổi";
    case API_ERROR_CODES.INVALID_ORDER_TRANSITION:
      return "Trạng thái đơn hàng không cho phép thao tác này";
    case API_ERROR_CODES.ORDER_EXPIRED:
      return "Đơn đã quá hạn xác nhận";
    case API_ERROR_CODES.VERSION_CONFLICT:
      return "Dữ liệu đã thay đổi ở phiên bản khác";
    case API_ERROR_CODES.REVIEW_NOT_ALLOWED:
      return "Không thể đánh giá đơn này";
    case API_ERROR_CODES.IDEMPOTENCY_CONFLICT:
      return "Yêu cầu đặt hàng khác lần gửi trước";
    case API_ERROR_CODES.RATE_LIMITED:
      return "Bạn thao tác quá nhanh";
    case "NETWORK_ERROR":
      return "Không thể kết nối máy chủ";
    default:
      return "Có lỗi xảy ra. Vui lòng thử lại.";
  }
}
