import { API_ERROR_CODES } from "@remarket/shared";
import { AppError } from "../middleware/errorHandler.js";

/**
 * Throwing helpers so routes never build an HTTP response by hand.
 * Codes and statuses follow detail-project 17.
 */

export const codes = API_ERROR_CODES;

export function validationError(
  message: string,
  fields?: Record<string, string>,
): AppError {
  return new AppError(
    API_ERROR_CODES.VALIDATION_ERROR,
    message,
    422,
    fields ? { fields } : undefined,
  );
}

export function unauthorized(message = "Phiên đăng nhập chưa hợp lệ."): AppError {
  return new AppError(API_ERROR_CODES.UNAUTHORIZED, message, 401);
}

export function forbidden(message = "Bạn không có quyền thực hiện thao tác này."): AppError {
  return new AppError(API_ERROR_CODES.FORBIDDEN, message, 403);
}

export function emailNotVerified(
  message = "Vui lòng xác minh email trước khi tiếp tục.",
): AppError {
  return new AppError(API_ERROR_CODES.EMAIL_NOT_VERIFIED, message, 403);
}

export function accountLocked(message = "Tài khoản đang bị hạn chế."): AppError {
  return new AppError(API_ERROR_CODES.ACCOUNT_LOCKED, message, 403);
}

export function notFound(message = "Không tìm thấy nội dung này."): AppError {
  return new AppError(API_ERROR_CODES.NOT_FOUND, message, 404);
}

/** 404 for a private resource hides its existence (detail-project 17). */
export function privateNotFound(message = "Không tìm thấy nội dung này."): AppError {
  return notFound(message);
}

export function conflict(code: string, message: string, status = 409): AppError {
  return new AppError(code, message, status);
}

export function productNotAvailable(
  message = "Sản phẩm không còn khả dụng.",
): AppError {
  return new AppError(API_ERROR_CODES.PRODUCT_NOT_AVAILABLE, message, 409);
}

export function priceChanged(
  message = "Giá sản phẩm đã thay đổi kể từ khi bạn thêm vào giỏ.",
  details?: Record<string, unknown>,
): AppError {
  return new AppError(API_ERROR_CODES.PRICE_CHANGED, message, 409, details);
}

export function versionConflict(
  message = "Dữ liệu đã được cập nhật bởi thao tác khác. Vui lòng thử lại.",
  details?: Record<string, unknown>,
): AppError {
  return new AppError(API_ERROR_CODES.VERSION_CONFLICT, message, 409, details);
}

export function invalidTransition(
  message = "Trạng thái đơn hàng không cho phép thao tác này.",
): AppError {
  return new AppError(API_ERROR_CODES.INVALID_ORDER_TRANSITION, message, 409);
}

export function orderExpired(
  message = "Đơn hàng đã hết hạn xác nhận.",
): AppError {
  return new AppError(API_ERROR_CODES.ORDER_EXPIRED, message, 409);
}

export function reviewNotAllowed(message = "Bạn chưa thể đánh giá đơn hàng này."): AppError {
  return new AppError(API_ERROR_CODES.REVIEW_NOT_ALLOWED, message, 409);
}

export function idempotencyConflict(
  message = "Yêu cầu thanh toán đã tồn tại với dữ liệu khác.",
): AppError {
  return new AppError(API_ERROR_CODES.IDEMPOTENCY_CONFLICT, message, 409);
}

export function retryLater(
  message = "Hệ thống đang bận, vui lòng thử lại sau.",
): AppError {
  return new AppError(API_ERROR_CODES.RETRY_LATER, message, 409);
}
