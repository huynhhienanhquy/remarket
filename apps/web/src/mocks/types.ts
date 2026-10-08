import type {
  AuditLogItem,
  CategoryNode,
  ConversationListItem,
  Message,
  Notification,
  OrderDetail,
  ProductImage,
  ReportRecord,
  Review,
  SessionUser,
  SupportMessage,
  SupportTicketDetail,
} from "@remarket/shared";

/** Internal shapes held by the in-memory mock database. */

export interface MockUser extends SessionUser {
  /** Demo-only credential for the mock login form; never used by a real API. */
  password: string;
  lock_reason: string | null;
  locked_at: string | null;
}

export interface MockProduct {
  id: string;
  seller_id: string;
  category_id: string;
  title: string;
  description: string;
  price: string;
  condition: OrderDetail["items"][number]["condition_snapshot"];
  usage_months: number | null;
  province_code: string;
  delivery_method: "COD" | "MEETUP" | "BOTH";
  shipping_fee: string;
  status: "PENDING" | "ACTIVE" | "REJECTED" | "RESERVED" | "SOLD" | "INACTIVE";
  version: number;
  is_blocked: boolean;
  block_reason: string | null;
  rejection_reason: string | null;
  reserved_order_id: string | null;
  published_at: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  images: ProductImage[];
}

/**
 * Orders keep only persisted fields. Viewer-dependent fields
 * (`role`, `counterparty`, `allowed_actions`, `review`, `completion_block_reason`)
 * are computed by the adapter per request, exactly like a real API.
 */
export interface MockOrder {
  id: string;
  code: string;
  checkout_request_id: string;
  buyer_id: string;
  seller_id: string;
  subtotal: string;
  shipping_fee: string;
  total_amount: string;
  currency: "VND";
  delivery_method: "COD" | "MEETUP";
  delivery: {
    recipient_name: string;
    recipient_phone: string;
    delivery_address: string;
    carrier: string | null;
    tracking_code: string | null;
  };
  status: OrderDetail["status"];
  version: number;
  expires_at: string | null;
  confirmed_at: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancellation_reason: string | null;
  created_at: string;
  updated_at: string;
  items: OrderDetail["items"];
  status_history: OrderDetail["status_history"];
}

export interface MockConversation {
  id: string;
  product_id: string;
  buyer_id: string;
  seller_id: string;
  created_at: string;
  updated_at: string;
}

export interface MockMessage extends Message {
  conversation_id: string;
}

export interface MockReview extends Review {
  reviewer_id: string;
  hidden_at: string | null;
  hidden_reason: string | null;
}

export interface MockReport extends ReportRecord {
  reporter_id: string;
  handled_by: string | null;
  handled_at: string | null;
  updated_at: string;
}

/** Tickets store persisted fields; `allowed_actions` is viewer-dependent. */
export interface MockTicket {
  id: string;
  code: string;
  user_id: string;
  order_id: string | null;
  assigned_admin_id: string | null;
  assigned_admin_name: string | null;
  subject: string;
  type: SupportTicketDetail["type"];
  status: SupportTicketDetail["status"];
  resolution_note: string | null;
  resolved_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
  messages: SupportMessage[];
}

export interface MockCartItem {
  user_id: string;
  product_id: string;
  created_at: string;
  /** Price the buyer saw when adding; used to flag price changes in cart. */
  added_price?: string;
}

export interface MockFavorite {
  user_id: string;
  product_id: string;
  created_at: string;
}

export interface MockCheckoutRequest {
  id: string;
  buyer_id: string;
  idempotency_key: string;
  request_hash: string;
  created_at: string;
}

export interface Database {
  users: MockUser[];
  categories: CategoryNode[];
  products: MockProduct[];
  favorites: MockFavorite[];
  cart_items: MockCartItem[];
  orders: MockOrder[];
  conversations: MockConversation[];
  messages: MockMessage[];
  reviews: MockReview[];
  reports: MockReport[];
  notifications: Notification[];
  tickets: MockTicket[];
  audit_logs: AuditLogItem[];
  checkout_requests: MockCheckoutRequest[];
  /**
   * Deterministic demo scenario (ui-spec 16): while a product is queued here,
   * the next checkout attempt reports PRICE_CHANGED with the new price and
   * applies it, so the confirm-new-price flow can be exercised with fixtures.
   */
  price_change_queue: Array<{ product_id: string; new_price: string }>;
}

/** Rows the adapter mutates during a session; built fresh on reset. */
export type ConversationSummary = ConversationListItem;
