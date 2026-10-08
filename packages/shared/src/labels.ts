import type {
  Condition,
  DeliveryMethod,
  NotificationType,
  OrderStatus,
  ProductStatus,
  ReportReason,
  ReportStatus,
  TicketStatus,
  TicketType,
  UserStatus,
} from "./enums.js";

/** Single source of truth for Vietnamese UI copy of stable enums (ui-spec 5). */

export type Tone = "brand" | "warning" | "danger" | "info" | "neutral";

export const PRODUCT_STATUS_LABELS: Record<ProductStatus, { label: string; tone: Tone }> = {
  PENDING: { label: "Chờ duyệt", tone: "warning" },
  ACTIVE: { label: "Đang bán", tone: "brand" },
  REJECTED: { label: "Bị từ chối", tone: "danger" },
  RESERVED: { label: "Đang được giữ", tone: "info" },
  SOLD: { label: "Đã bán", tone: "neutral" },
  INACTIVE: { label: "Đã ẩn", tone: "neutral" },
};

export const ORDER_STATUS_LABELS: Record<OrderStatus, { label: string; tone: Tone }> = {
  PENDING: { label: "Chờ người bán xác nhận", tone: "warning" },
  CONFIRMED: { label: "Đã xác nhận", tone: "info" },
  SHIPPING: { label: "Đang giao", tone: "info" },
  DELIVERED: { label: "Đã ghi nhận giao hàng", tone: "info" },
  COMPLETED: { label: "Hoàn tất", tone: "brand" },
  CANCELLED: { label: "Đã hủy", tone: "neutral" },
};

export const CONDITION_LABELS: Record<Condition, string> = {
  LIKE_NEW: "Như mới",
  GOOD: "Tốt",
  FAIR: "Khá",
  HEAVILY_USED: "Đã sử dụng nhiều",
};

export const DELIVERY_LABELS: Record<DeliveryMethod, string> = {
  COD: "Giao hàng, trả tiền mặt",
  MEETUP: "Gặp trực tiếp",
  BOTH: "Cả hai hình thức",
};

/** Label for the method actually written on an order (BOTH never appears). */
export const ORDER_DELIVERY_LABELS: Record<"COD" | "MEETUP", string> = {
  COD: "Giao hàng, trả tiền mặt",
  MEETUP: "Gặp trực tiếp",
};

export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  COUNTERFEIT: "Hàng giả, hàng nhái",
  PROHIBITED: "Hàng cấm hoặc không được phép bán",
  FRAUD: "Lừa đảo, gian lận",
  SPAM: "Spam hoặc đăng trùng lặp",
  HARASSMENT: "Quấy rối, lăng mạ",
  INAPPROPRIATE: "Nội dung không phù hợp",
  OTHER: "Lý do khác",
};

export const REPORT_STATUS_LABELS: Record<ReportStatus, { label: string; tone: Tone }> = {
  PENDING: { label: "Chờ xử lý", tone: "warning" },
  RESOLVED: { label: "Đã xử lý", tone: "brand" },
  REJECTED: { label: "Không chấp nhận", tone: "neutral" },
};

export const TICKET_STATUS_LABELS: Record<TicketStatus, { label: string; tone: Tone }> = {
  OPEN: { label: "Mới gửi", tone: "warning" },
  IN_PROGRESS: { label: "Đang xử lý", tone: "info" },
  RESOLVED: { label: "Đã giải quyết", tone: "brand" },
  CLOSED: { label: "Đã đóng", tone: "neutral" },
};

export const TICKET_TYPE_LABELS: Record<TicketType, string> = {
  ACCOUNT: "Tài khoản",
  ORDER_PROBLEM: "Vấn đề đơn hàng",
  PRODUCT: "Sản phẩm",
  OTHER: "Khác",
};

export const USER_STATUS_LABELS: Record<UserStatus, { label: string; tone: Tone }> = {
  ACTIVE: { label: "Hoạt động", tone: "brand" },
  LOCKED: { label: "Bị khóa", tone: "danger" },
};

export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  PRODUCT_APPROVED: "Tin đăng đã được duyệt",
  PRODUCT_REJECTED: "Tin đăng bị từ chối",
  PRODUCT_BLOCKED: "Tin đăng bị hạn chế",
  NEW_MESSAGE: "Tin nhắn mới",
  ORDER_CREATED: "Đơn hàng đã tạo",
  ORDER_CONFIRMED: "Đơn hàng đã xác nhận",
  ORDER_CANCELLED: "Đơn hàng đã hủy",
  ORDER_SHIPPED: "Đơn hàng đang giao",
  ORDER_DELIVERED: "Đã ghi nhận giao hàng",
  ORDER_COMPLETED: "Đơn hàng hoàn tất",
  ORDER_REMINDER: "Nhắc xử lý đơn hàng",
  REVIEW_CREATED: "Đánh giá mới",
  TICKET_REPLY: "Phản hồi hỗ trợ",
  REPORT_RESULT: "Kết quả báo cáo",
  EMAIL_VERIFICATION_REQUESTED: "Yêu cầu xác minh email",
  EMAIL_VERIFIED: "Email đã được xác minh",
};

export function productStatusLabel(status: ProductStatus): string {
  return PRODUCT_STATUS_LABELS[status].label;
}

export function orderStatusLabel(status: OrderStatus): string {
  return ORDER_STATUS_LABELS[status].label;
}

