import type {
  CategoryStatus,
  Condition,
  DeliveryMethod,
  NotificationType,
  OrderDeliveryMethod,
  OrderStatus,
  ProductStatus,
  ReportReason,
  ReportStatus,
  TicketStatus,
  TicketType,
  UserRole,
  UserStatus,
} from "./enums.js";

/**
 * Amounts are decimal strings of VND integers (detail-project 13.1) so that
 * JavaScript never rounds them through Number.
 */
export type MoneyString = string;

/** ISO 8601 timestamp with timezone. */
export type IsoDateTime = string;

/* ------------------------------------------------------------------ *
 * Envelope (detail-project 14)
 * ------------------------------------------------------------------ */

export interface ApiMeta {
  request_id: string;
  page?: number;
  page_size?: number;
  total?: number;
  total_pages?: number;
}

export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta: ApiMeta;
}

export interface ApiErrorBody {
  success: false;
  error: {
    code: ApiErrorCode;
    message: string;
    details?: Record<string, unknown>;
  };
  meta: ApiMeta;
}

export const API_ERROR_CODES = {
  VALIDATION_ERROR: "VALIDATION_ERROR",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  EMAIL_NOT_VERIFIED: "EMAIL_NOT_VERIFIED",
  ACCOUNT_LOCKED: "ACCOUNT_LOCKED",
  NOT_FOUND: "NOT_FOUND",
  PRODUCT_NOT_AVAILABLE: "PRODUCT_NOT_AVAILABLE",
  PRICE_CHANGED: "PRICE_CHANGED",
  INVALID_ORDER_TRANSITION: "INVALID_ORDER_TRANSITION",
  ORDER_EXPIRED: "ORDER_EXPIRED",
  VERSION_CONFLICT: "VERSION_CONFLICT",
  REVIEW_NOT_ALLOWED: "REVIEW_NOT_ALLOWED",
  IDEMPOTENCY_CONFLICT: "IDEMPOTENCY_CONFLICT",
  RETRY_LATER: "RETRY_LATER",
  RATE_LIMITED: "RATE_LIMITED",
  SESSION_EXPIRED: "SESSION_EXPIRED",
  INTERNAL: "INTERNAL",
} as const;
export type ApiErrorCode = (typeof API_ERROR_CODES)[keyof typeof API_ERROR_CODES];

export interface PageMeta {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

/* ------------------------------------------------------------------ *
 * Identity (ui-spec 25: SessionUser, SellerSummary)
 * ------------------------------------------------------------------ */

export interface EmailVerificationRequest {
  id: string;
  user: { id: string; full_name: string; email: string; status: UserStatus };
  status: "PENDING" | "APPROVED";
  requested_at: IsoDateTime;
  approved_at: IsoDateTime | null;
}

export interface SessionUser {
  id: string;
  full_name: string;
  email: string;
  avatar_url: string | null;
  role: UserRole;
  status: UserStatus;
  email_verified_at: IsoDateTime | null;
  phone: string | null;
  province_code: string | null;
  default_address: string | null;
  joined_at: IsoDateTime;
}

export interface SellerSummary {
  id: string;
  name: string;
  avatar_url: string | null;
  province_code: string | null;
  province_label: string | null;
  joined_at: IsoDateTime;
  /** NULL when the seller has no visible review yet. */
  rating: number | null;
  review_count: number;
  completed_sales_count: number;
}

export interface PublicProfile {
  seller: SellerSummary;
  bio?: never;
}

/* ------------------------------------------------------------------ *
 * Categories & geography
 * ------------------------------------------------------------------ */

export interface CategoryNode {
  id: string;
  parent_id: string | null;
  name: string;
  slug: string;
  status: CategoryStatus;
  children?: CategoryNode[];
}

/* ------------------------------------------------------------------ *
 * Products
 * ------------------------------------------------------------------ */

export interface ProductImage {
  id: string;
  url: string;
  /** Present for the owner so edits can re-submit the private object key. */
  storage_path?: string;
  sort_order: number;
}

export interface ProductListItem {
  id: string;
  title: string;
  price: MoneyString;
  image_url: string | null;
  condition: Condition;
  province_code: string;
  /** null when the code is not in the current geography dataset. */
  province_label: string | null;
  published_at: IsoDateTime | null;
  created_at: IsoDateTime;
  status: ProductStatus;
  is_favorited: boolean;
  seller: SellerSummary;
  /** Absent on public lists unless the viewer is the owner. */
  is_blocked?: boolean;
  /**
   * Owner/admin-only view of a blocked or deleted listing. When true the UI
   * must render a placeholder instead of title/price/image (ui-spec 17).
   */
  is_hidden?: boolean;
}

export interface ProductCapabilities {
  can_buy: boolean;
  can_add_to_cart: boolean;
  can_chat: boolean;
  can_favorite: boolean;
  can_report: boolean;
  can_edit: boolean;
  can_manage: boolean;
  /** Explains why the primary action is disabled; null when allowed. */
  unavailable_reason: string | null;
}

export interface ProductDetail extends ProductListItem {
  description: string;
  images: ProductImage[];
  category_id: string;
  category_path: string[];
  usage_months: number | null;
  delivery_method: DeliveryMethod;
  shipping_fee: MoneyString;
  version: number;
  is_blocked: boolean;
  block_reason: string | null;
  rejection_reason: string | null;
  capabilities: ProductCapabilities;
}

/** Own listing extras for /account/products (ui-spec 25). */
export interface OwnProduct extends ProductDetail {
  allowed_actions: ProductAction[];
}

export type ProductAction =
  | "edit"
  | "submit"
  | "resubmit"
  | "hide"
  | "delete"
  | "view";

export interface ProductListResponse {
  items: ProductListItem[];
  meta: PageMeta;
}

/* ------------------------------------------------------------------ *
 * Favorites & cart
 * ------------------------------------------------------------------ */

export interface FavoriteListResponse {
  items: ProductListItem[];
  meta: PageMeta;
}

export interface CartItemView {
  product_id: string;
  title: string;
  price: MoneyString;
  image_url: string | null;
  condition: Condition;
  status: ProductStatus;
  province_label: string | null;
  available: boolean;
  /** Why the item cannot be checked out (price changed, sold, ...). */
  unavailable_reason: string | null;
}

export interface CartGroup {
  seller: SellerSummary;
  items: CartItemView[];
}

export interface CartView {
  groups: CartGroup[];
  total_items: number;
}

/* ------------------------------------------------------------------ *
 * Checkout & orders
 * ------------------------------------------------------------------ */

export interface CheckoutItemInput {
  product_id: string;
  expected_price: MoneyString;
}

export interface CheckoutDeliveryInput {
  seller_id: string;
  method: OrderDeliveryMethod;
  recipient_name: string;
  recipient_phone: string;
  delivery_address: string;
  expected_shipping_fee: MoneyString;
}

export interface CheckoutPayload {
  items: CheckoutItemInput[];
  deliveries: CheckoutDeliveryInput[];
}

export interface OrderItemSnapshot {
  id: string;
  product_id: string;
  title_snapshot: string;
  condition_snapshot: Condition;
  image_path_snapshot: string | null;
  image_url: string | null;
  price: MoneyString;
}

export interface OrderListItem {
  id: string;
  code: string;
  role: "buyer" | "seller";
  counterparty: SellerSummary;
  status: OrderStatus;
  delivery_method: OrderDeliveryMethod;
  items: OrderItemSnapshot[];
  total_amount: MoneyString;
  created_at: IsoDateTime;
  expires_at: IsoDateTime | null;
}

export interface OrderStatusHistoryEntry {
  from_status: OrderStatus | null;
  to_status: OrderStatus;
  actor_type: "USER" | "ADMIN" | "SYSTEM";
  actor_name: string | null;
  reason: string | null;
  created_at: IsoDateTime;
}

export interface OrderDeliveryInfo {
  method: OrderDeliveryMethod;
  recipient_name: string;
  recipient_phone: string;
  delivery_address: string;
  carrier: string | null;
  tracking_code: string | null;
}

export type OrderAction =
  | "confirm"
  | "cancel"
  | "ship"
  | "deliver"
  | "complete"
  | "review"
  | "support"
  | "chat";

export interface OrderDetail extends OrderListItem {
  version: number;
  subtotal: MoneyString;
  shipping_fee: MoneyString;
  currency: "VND";
  delivery: OrderDeliveryInfo;
  status_history: OrderStatusHistoryEntry[];
  allowed_actions: OrderAction[];
  /** Safe message explaining why completion is blocked (open ticket, ...). */
  completion_block_reason: string | null;
  cancellation_reason: string | null;
  confirmed_at: IsoDateTime | null;
  shipped_at: IsoDateTime | null;
  delivered_at: IsoDateTime | null;
  completed_at: IsoDateTime | null;
  cancelled_at: IsoDateTime | null;
  review: OrderReviewState;
  conversation_id: string | null;
}

export interface OrderReviewState {
  can_review: boolean;
  /** Reason shown when review is not allowed (already reviewed / expired). */
  reason: string | null;
  existing: Review | null;
}

export interface OrderListResponse {
  items: OrderListItem[];
  meta: PageMeta;
}

export interface CheckoutResult {
  checkout_request_id: string;
  orders: OrderListItem[];
}

/* ------------------------------------------------------------------ *
 * Chat
 * ------------------------------------------------------------------ */

export interface ConversationListItem {
  id: string;
  /** Authoritative composer capability; historical messages remain readable. */
  can_send?: boolean;
  unavailable_reason?: string | null;
  counterparty: {
    id: string;
    name: string;
    avatar_url: string | null;
  };
  product: {
    id: string;
    title: string;
    image_url: string | null;
    status: ProductStatus;
    price: MoneyString;
  } | null;
  last_message: {
    content: string;
    created_at: IsoDateTime;
    sender_id: string;
  } | null;
  unread_count: number;
  updated_at: IsoDateTime;
}

export interface Message {
  id: string;
  client_message_id: string;
  sender_id: string;
  content: string;
  created_at: IsoDateTime;
  read_at: IsoDateTime | null;
}

export interface MessagePage {
  items: Message[];
  /** Opaque cursor for older messages; null when the start is reached. */
  next_cursor: string | null;
}

/* ------------------------------------------------------------------ *
 * Reviews, reports, notifications, support
 * ------------------------------------------------------------------ */

export interface Review {
  id: string;
  order_id: string;
  rating: number;
  comment: string | null;
  created_at: IsoDateTime;
  reviewer: {
    id: string;
    name: string;
    avatar_url: string | null;
  };
  reviewed_user_id: string;
}

export interface ReportRequest {
  target_type: "product" | "user";
  product_id?: string;
  user_id?: string;
  reason: ReportReason;
  description?: string;
}

export interface ReportRecord {
  id: string;
  target_type: "product" | "user";
  target_label: string;
  target_id: string;
  reason: ReportReason;
  description: string | null;
  status: ReportStatus;
  resolution_note: string | null;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  content: string;
  reference_type: string;
  reference_id: string | null;
  /** Server-side dedupe key (detail-project 11.3); optional in the DTO. */
  dedupe_key?: string;
  read_at: IsoDateTime | null;
  created_at: IsoDateTime;
}

export interface SupportTicketListItem {
  id: string;
  code: string;
  subject: string;
  type: TicketType;
  status: TicketStatus;
  order_id: string | null;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}

export interface SupportMessage {
  id: string;
  sender: {
    id: string;
    name: string;
    role: "USER" | "ADMIN";
  };
  message: string;
  created_at: IsoDateTime;
}

export interface SupportTicketDetail extends SupportTicketListItem {
  resolution_note: string | null;
  resolved_at: IsoDateTime | null;
  closed_at: IsoDateTime | null;
  assigned_admin_name: string | null;
  messages: SupportMessage[];
  allowed_actions: SupportAction[];
}

export type SupportAction = "reply" | "close" | "reopen" | "resolve" | "progress";

export interface CreateSupportTicketInput {
  type: TicketType;
  subject: string;
  message: string;
  order_id?: string;
}

/* ------------------------------------------------------------------ *
 * Admin (ui-spec 25 + section 23)
 * ------------------------------------------------------------------ */

export interface AdminDashboard {
  total_users: number;
  new_users_in_period: number;
  pending_products: number;
  completed_orders_in_period: number;
  completed_order_value_in_period: MoneyString;
  pending_reports: number;
  products_by_status: Record<ProductStatus, number>;
  blocked_products: number;
  /** OPEN and IN_PROGRESS tickets still requiring support work. */
  unresolved_tickets: number;
  /** Five newest moderation items, never a replacement for the paginated list. */
  pending_products_queue: AdminProductItem[];
  /** Five newest OPEN support items, never a replacement for the paginated list. */
  open_tickets_queue: AdminSupportTicketItem[];
}

export interface AdminUserItem {
  id: string;
  full_name: string;
  email: string;
  avatar_url: string | null;
  phone: string | null;
  province_code: string | null;
  province_label: string | null;
  default_address: string | null;
  email_verified_at: IsoDateTime | null;
  role: UserRole;
  status: UserStatus;
  created_at: IsoDateTime;
  lock_reason: string | null;
  locked_at: IsoDateTime | null;
}

export interface AdminProductItem {
  id: string;
  title: string;
  price: MoneyString;
  image_url: string | null;
  status: ProductStatus;
  is_blocked: boolean;
  block_reason: string | null;
  rejection_reason: string | null;
  version: number;
  updated_at: IsoDateTime;
  created_at: IsoDateTime;
  seller: SellerSummary;
  category_name: string;
  description: string;
  images: ProductImage[];
  condition: Condition;
  usage_months: number | null;
  province_code: string;
  delivery_method: DeliveryMethod;
  shipping_fee: MoneyString;
}

export interface AdminSupportTicketItem extends SupportTicketListItem {
  user: { id: string; name: string };
  assigned_admin: { id: string; name: string } | null;
}

export interface AdminSupportOrderSummary {
  id: string;
  code: string;
  status: OrderStatus;
  version: number;
  buyer: { id: string; name: string };
  seller: { id: string; name: string };
  delivery_method: OrderDeliveryMethod;
  items: OrderItemSnapshot[];
  total_amount: MoneyString;
  created_at: IsoDateTime;
  status_history: OrderStatusHistoryEntry[];
  cancellation_reason: string | null;
}

export interface AdminSupportTicketDetail extends SupportTicketDetail {
  user: { id: string; name: string };
  assigned_admin: { id: string; name: string } | null;
  /** Safe support-only snapshot; excludes delivery PII. */
  order: AdminSupportOrderSummary | null;
}

export interface AdminOrderCancelInput {
  expected_version: number;
  reason: string;
  ticket_id?: string;
  delivery_outcome?: "NOT_DELIVERED" | "RETURNED";
  payment_resolution?: string;
}

export interface AdminOrderCancelResult {
  id: string;
  status: "CANCELLED";
  version: number;
}

export interface AdminReportItem extends ReportRecord {
  reporter_name: string;
  handled_by_name: string | null;
  handled_at: IsoDateTime | null;
}

export interface AdminReviewItem extends Review {
  order_code: string;
  reviewed_user_name: string;
  hidden_at: IsoDateTime | null;
  hidden_reason: string | null;
}

export interface AuditLogItem {
  id: string;
  actor_id?: string | null;
  actor_name: string | null;
  actor_type: "USER" | "ADMIN" | "SYSTEM";
  action: string;
  entity_type: string;
  entity_id: string | null;
  reason: string | null;
  metadata: Record<string, unknown>;
  created_at: IsoDateTime;
}

/* ------------------------------------------------------------------ *
 * Query parameter shapes (ui-spec 25 point 1: keyword is `q`)
 * ------------------------------------------------------------------ */

export interface ProductQuery {
  q?: string;
  category_id?: string;
  min_price?: string;
  max_price?: string;
  condition?: Condition;
  province_code?: string;
  delivery_method?: DeliveryMethod;
  sort?: "newest" | "price_asc" | "price_desc";
  page?: number;
  page_size?: number;
}
