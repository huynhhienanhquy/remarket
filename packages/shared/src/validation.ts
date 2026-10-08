import { CONDITION_LABELS, DELIVERY_LABELS } from "./labels.js";
import { normalizeVndInput, validatePrice, validateShippingFee } from "./money.js";
import { CONDITIONS, DELIVERY_METHODS, REPORT_REASONS } from "./enums.js";
import type { Condition, DeliveryMethod, ReportReason } from "./enums.js";

/**
 * Client-side validation mirrors backend limits (detail-project 4, 6, 11.4)
 * so the form can give instant feedback; the server stays authoritative.
 */

export interface FieldErrors {
  [field: string]: string;
}

export const AUTH_LIMITS = {
  fullNameMax: 100,
  emailMax: 254,
  phoneMax: 20,
  passwordMin: 12,
  /** bcrypt rejects input beyond 72 UTF-8 bytes; the UI states it up front. */
  passwordMaxBytes: 72,
} as const;

export const PRODUCT_LIMITS = {
  titleMin: 5,
  titleMax: 150,
  descriptionMin: 20,
  descriptionMax: 5000,
  imagesMax: 8,
  usageMonthsMax: 1200,
} as const;

export const SUPPORT_LIMITS = {
  subjectMin: 5,
  subjectMax: 150,
  messageMin: 1,
  messageMax: 5000,
} as const;

export const REVIEW_LIMITS = {
  commentMax: 1000,
  /** One review per order, within 30 days of completion. */
  windowDays: 30,
} as const;

export const REPORT_LIMITS = {
  descriptionMax: 2000,
} as const;

export const CHAT_LIMITS = {
  messageMin: 1,
  messageMax: 2000,
} as const;

export function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

export function validateRequired(value: string, label: string): string | null {
  return value.trim() === "" ? `${label} không được để trống.` : null;
}

export function validateFullName(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed === "") return "Họ tên không được để trống.";
  if (trimmed.length > AUTH_LIMITS.fullNameMax) {
    return `Họ tên tối đa ${AUTH_LIMITS.fullNameMax} ký tự.`;
  }
  return null;
}

/** Practical email check; the backend still validates uniqueness and format. */
export function validateEmail(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed === "") return "Email không được để trống.";
  if (trimmed.length > AUTH_LIMITS.emailMax) return "Email quá dài.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return "Email không hợp lệ.";
  return null;
}

export function validatePhone(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed === "") return "Số điện thoại không được để trống.";
  if (!/^\d{9,11}$/.test(trimmed)) return "Số điện thoại gồm 9–11 chữ số.";
  return null;
}

export function validatePassword(value: string): string | null {
  if (value.length < AUTH_LIMITS.passwordMin) {
    return `Mật khẩu cần ít nhất ${AUTH_LIMITS.passwordMin} ký tự.`;
  }
  if (utf8ByteLength(value) > AUTH_LIMITS.passwordMaxBytes) {
    return `Mật khẩu không được vượt ${AUTH_LIMITS.passwordMaxBytes} byte UTF-8.`;
  }
  return null;
}

export function validatePasswordConfirm(
  password: string,
  confirm: string,
): string | null {
  if (confirm === "") return "Vui lòng nhập lại mật khẩu.";
  if (password !== confirm) return "Mật khẩu nhập lại không khớp.";
  return null;
}

export function validateProductTitle(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length < PRODUCT_LIMITS.titleMin) {
    return `Tên món đồ cần ít nhất ${PRODUCT_LIMITS.titleMin} ký tự.`;
  }
  if (trimmed.length > PRODUCT_LIMITS.titleMax) {
    return `Tên món đồ tối đa ${PRODUCT_LIMITS.titleMax} ký tự.`;
  }
  return null;
}

export function validateDescription(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length < PRODUCT_LIMITS.descriptionMin) {
    return `Mô tả cần ít nhất ${PRODUCT_LIMITS.descriptionMin} ký tự.`;
  }
  if (trimmed.length > PRODUCT_LIMITS.descriptionMax) {
    return `Mô tả tối đa ${PRODUCT_LIMITS.descriptionMax} ký tự.`;
  }
  return null;
}

export function validateCondition(value: string): string | null {
  return (CONDITIONS as readonly string[]).includes(value)
    ? null
    : "Hãy chọn tình trạng món đồ.";
}

export function validateUsageMonths(value: string): string | null {
  if (value.trim() === "") return null;
  if (!/^\d+$/.test(value.trim())) return "Số tháng sử dụng phải là số nguyên không âm.";
  if (Number(value) > PRODUCT_LIMITS.usageMonthsMax) {
    return `Số tháng sử dụng tối đa ${PRODUCT_LIMITS.usageMonthsMax}.`;
  }
  return null;
}

export function validateCategory(value: string): string | null {
  return value === "" ? "Hãy chọn danh mục." : null;
}

export function validateDeliveryMethod(value: string): string | null {
  return (DELIVERY_METHODS as readonly string[]).includes(value)
    ? null
    : "Hãy chọn hình thức giao nhận.";
}

/** Shipping fee is required for COD/BOTH and must be 0 for MEETUP. */
export function validateShippingFeeFor(
  raw: string,
  method: DeliveryMethod,
): string | null {
  if (method === "MEETUP") return null;
  return validateShippingFee(raw, true);
}

export function validatePriceInput(raw: string): string | null {
  if (raw.trim() === "") return "Giá không được để trống.";
  return validatePrice(raw);
}

export function validateSupportSubject(value: string): string | null {
  const length = value.trim().length;
  if (length < SUPPORT_LIMITS.subjectMin) {
    return `Tiêu đề cần ít nhất ${SUPPORT_LIMITS.subjectMin} ký tự.`;
  }
  if (length > SUPPORT_LIMITS.subjectMax) {
    return `Tiêu đề tối đa ${SUPPORT_LIMITS.subjectMax} ký tự.`;
  }
  return null;
}

export function validateSupportMessage(value: string): string | null {
  const length = value.trim().length;
  if (length < SUPPORT_LIMITS.messageMin) return "Nội dung không được để trống.";
  if (length > SUPPORT_LIMITS.messageMax) {
    return `Nội dung tối đa ${SUPPORT_LIMITS.messageMax} ký tự.`;
  }
  return null;
}

export function validateChatMessage(value: string): string | null {
  const length = value.trim().length;
  if (length < CHAT_LIMITS.messageMin) return null;
  if (length > CHAT_LIMITS.messageMax) {
    return `Tin nhắn tối đa ${CHAT_LIMITS.messageMax} ký tự.`;
  }
  return null;
}

export function validateReviewComment(value: string): string | null {
  if (value.length > REVIEW_LIMITS.commentMax) {
    return `Nhận xét tối đa ${REVIEW_LIMITS.commentMax} ký tự.`;
  }
  return null;
}

export function validateReportDescription(
  value: string,
  reason: ReportReason,
): string | null {
  if (value.length > REPORT_LIMITS.descriptionMax) {
    return `Mô tả tối đa ${REPORT_LIMITS.descriptionMax} ký tự.`;
  }
  if (reason === "OTHER" && value.trim() === "") {
    return "Vui lòng mô tả lý do báo cáo.";
  }
  return null;
}

export function isReportReason(value: string): value is ReportReason {
  return (REPORT_REASONS as readonly string[]).includes(value);
}

export function isCondition(value: string): value is Condition {
  return (CONDITIONS as readonly string[]).includes(value);
}

/** Normalizes the price range filter; returns null when incomplete/invalid. */
export function normalizePriceFilter(
  from: string,
  to: string,
): { min: string | null; max: string | null; error: string | null } {
  const min = from.trim() === "" ? null : normalizeVndInput(from);
  const max = to.trim() === "" ? null : normalizeVndInput(to);

  if (from.trim() !== "" && min === null) {
    return { min: null, max: null, error: "Giá từ phải là số nguyên." };
  }
  if (to.trim() !== "" && max === null) {
    return { min: null, max: null, error: "Giá đến phải là số nguyên." };
  }
  if (min !== null && max !== null && BigInt(min) > BigInt(max)) {
    return { min: null, max: null, error: "Giá từ phải nhỏ hơn hoặc bằng giá đến." };
  }
  return { min, max, error: null };
}

/** UI copy shared by the product form summary and order/item displays. */
export function conditionLabel(condition: Condition): string {
  return CONDITION_LABELS[condition];
}

export function deliveryLabel(method: DeliveryMethod): string {
  return DELIVERY_LABELS[method];
}

