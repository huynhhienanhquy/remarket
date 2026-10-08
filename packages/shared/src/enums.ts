/**
 * Stable enum values shared by the UI and the API.
 * UI renders Vietnamese labels through `labels.ts`; these codes never change.
 */

export const PRODUCT_STATUSES = [
  "PENDING",
  "ACTIVE",
  "REJECTED",
  "RESERVED",
  "SOLD",
  "INACTIVE",
] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

export const ORDER_STATUSES = [
  "PENDING",
  "CONFIRMED",
  "SHIPPING",
  "DELIVERED",
  "COMPLETED",
  "CANCELLED",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const CONDITIONS = [
  "LIKE_NEW",
  "GOOD",
  "FAIR",
  "HEAVILY_USED",
] as const;
export type Condition = (typeof CONDITIONS)[number];

export const DELIVERY_METHODS = ["COD", "MEETUP", "BOTH"] as const;
export type DeliveryMethod = (typeof DELIVERY_METHODS)[number];

/** Chooses method allowed on an order: BOTH never appears on an order itself. */
export const ORDER_DELIVERY_METHODS = ["COD", "MEETUP"] as const;
export type OrderDeliveryMethod = (typeof ORDER_DELIVERY_METHODS)[number];

export const USER_ROLES = ["USER", "ADMIN"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const USER_STATUSES = ["ACTIVE", "LOCKED"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const REPORT_REASONS = [
  "COUNTERFEIT",
  "PROHIBITED",
  "FRAUD",
  "SPAM",
  "HARASSMENT",
  "INAPPROPRIATE",
  "OTHER",
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_STATUSES = ["PENDING", "RESOLVED", "REJECTED"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const TICKET_TYPES = ["ACCOUNT", "ORDER_PROBLEM", "PRODUCT", "OTHER"] as const;
export type TicketType = (typeof TICKET_TYPES)[number];

export const TICKET_STATUSES = [
  "OPEN",
  "IN_PROGRESS",
  "RESOLVED",
  "CLOSED",
] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const CATEGORY_STATUSES = ["ACTIVE", "INACTIVE"] as const;
export type CategoryStatus = (typeof CATEGORY_STATUSES)[number];

/** Notification types listed in detail-project 11.3. */
export const NOTIFICATION_TYPES = [
  "PRODUCT_APPROVED",
  "PRODUCT_REJECTED",
  "PRODUCT_BLOCKED",
  "NEW_MESSAGE",
  "ORDER_CREATED",
  "ORDER_CONFIRMED",
  "ORDER_CANCELLED",
  "ORDER_SHIPPED",
  "ORDER_DELIVERED",
  "ORDER_COMPLETED",
  "ORDER_REMINDER",
  "REVIEW_CREATED",
  "TICKET_REPLY",
  "REPORT_RESULT",
  "EMAIL_VERIFICATION_REQUESTED",
  "EMAIL_VERIFIED",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const SORT_OPTIONS = ["newest", "price_asc", "price_desc"] as const;
export type SortOption = (typeof SORT_OPTIONS)[number];

