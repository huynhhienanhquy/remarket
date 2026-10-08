import type {
  AdminDashboard,
  AdminOrderCancelInput,
  AdminOrderCancelResult,
  AdminProductItem,
  AdminReportItem,
  AdminReviewItem,
  AdminSupportTicketDetail,
  AdminSupportTicketItem,
  AdminUserItem,
  AuditLogItem,
  CartView,
  CategoryNode,
  CheckoutPayload,
  CheckoutResult,
  ConversationListItem,
  CreateSupportTicketInput,
  FavoriteListResponse,
  EmailVerificationRequest,
  PageMeta,
  MessagePage,
  Notification,
  OrderDetail,
  OrderListResponse,
  OwnProduct,
  ProductDetail,
  ProductListResponse,
  ProductQuery,
  Province,
  PublicProfile,
  ReportRecord,
  ReportRequest,
  Review,
  SessionUser,
  SupportTicketDetail,
  SupportTicketListItem,
} from "@remarket/shared";
import type {
  OrderAction,
  ProductStatus,
  ReportReason,
  ReportStatus,
  SortOption,
  TicketStatus,
  TicketType,
  UserRole,
  UserStatus,
} from "@remarket/shared";

/**
 * Typed contract between the application and the REST API (ui-spec 25).
 *
 * Live implementation maps 1:1 to the endpoints in detail-project 14.1.
 */
export interface ApiAdapter {
  auth: AuthApi;
  categories: CategoriesApi;
  products: ProductsApi;
  uploads: UploadsApi;
  favorites: FavoritesApi;
  cart: CartApi;
  checkout: CheckoutApi;
  orders: OrdersApi;
  chat: ChatApi;
  reviews: ReviewsApi;
  reports: ReportsApi;
  notifications: NotificationsApi;
  support: SupportApi;
  profiles: ProfilesApi;
  admin: AdminApi;
}

/* ------------------------------------------------------------------ */

export interface RegisterInput {
  full_name: string;
  email: string;
  password: string;
  confirm_password: string;
  phone: string;
}

export interface AuthApi {
  /** Initial non-consuming cookie discovery; 200/null for an anonymous session. */
  bootstrap(): Promise<SessionUser | null>;
  /** Returns the viewer if a valid access token exists; null if not authenticated. */
  me(): Promise<SessionUser | null>;
  register(input: RegisterInput): Promise<{ pending_verification: true; email: string }>;
  login(email: string, password: string): Promise<SessionUser>;
  logout(): Promise<void>;
  logoutAll(): Promise<void>;
  verifyEmail(token: string): Promise<SessionUser>;
  emailVerificationRequest(): Promise<EmailVerificationRequest | null>;
  requestEmailVerification(): Promise<EmailVerificationRequest | null>;
  resendVerification(email: string): Promise<{ retry_after?: string }>;
  forgotPassword(email: string): Promise<{ accepted: true }>;
  resetPassword(token: string, password: string): Promise<{ accepted: true }>;
  updateProfile(
    input: Partial<
      Pick<SessionUser, "full_name" | "phone" | "province_code" | "default_address">
    >,
  ): Promise<SessionUser>;
  uploadAvatar(storagePath: string): Promise<SessionUser>;
}

export interface CategoriesApi {
  tree(): Promise<CategoryNode[]>;
  provinces(): Promise<Province[]>;
}

export interface ProductsApi {
  list(query: ProductQuery): Promise<ProductListResponse>;
  detail(id: string): Promise<ProductDetail>;
  /** Own listings with owner-only fields and allowed actions (ui-spec 25). */
  mine(query: { status?: ProductStatus; page?: number; page_size?: number }): Promise<{
    items: OwnProduct[];
    meta: ProductListResponse["meta"];
  }>;
  create(input: ProductInput): Promise<ProductDetail>;
  update(
    id: string,
    input: ProductInput,
    expectedVersion: number,
  ): Promise<ProductDetail>;
  submit(id: string): Promise<ProductDetail>;
  hide(id: string): Promise<ProductDetail>;
  remove(id: string): Promise<{ id: string }>;
}

export interface ProductImageInput {
  storage_path?: string;
  url: string;
  sort_order: number;
}

export interface ProductInput {
  title: string;
  description: string;
  category_id: string;
  price: string;
  condition: ProductDetail["condition"];
  usage_months: number | null;
  province_code: string;
  delivery_method: ProductDetail["delivery_method"];
  shipping_fee: string;
  images: ProductImageInput[];
}

export interface UploadsApi {
  /** Multipart upload; returns a storage path plus a short-lived preview URL. */
  upload(file: File, purpose: "product" | "avatar"): Promise<{ url: string; storage_path: string }>;
}

export interface FavoritesApi {
  list(page?: number): Promise<FavoriteListResponse>;
  set(productId: string, on: boolean): Promise<{ is_favorited: boolean }>;
}

export interface CartApi {
  get(): Promise<CartView>;
  add(productId: string): Promise<CartView>;
  remove(productId: string): Promise<CartView>;
}

export interface CheckoutApi {
  /** Sends Idempotency-Key; may throw PRICE_CHANGED / PRODUCT_NOT_AVAILABLE. */
  create(
    payload: CheckoutPayload,
    idempotencyKey: string,
  ): Promise<CheckoutResult>;
}

export interface OrderQuery {
  role: "buyer" | "seller";
  status?: string;
  page?: number;
}

export interface OrdersApi {
  list(query: OrderQuery): Promise<OrderListResponse>;
  detail(id: string): Promise<OrderDetail>;
  act(
    id: string,
    action: Exclude<OrderAction, "review" | "support" | "chat">,
    body: {
      expected_version: number;
      reason?: string;
      carrier?: string;
      tracking_code?: string;
      buyer_confirmed_received?: boolean;
      buyer_confirmed_paid?: boolean;
    },
  ): Promise<OrderDetail>;
}

export interface ChatApi {
  conversations(page?: number): Promise<{ items: ConversationListItem[]; meta: { total: number } }>;
  detail(conversationId: string): Promise<ConversationListItem>;
  /** Opens the single conversation for (product, buyer, seller). */
  open(productId: string): Promise<{ id: string }>;
  messages(
    conversationId: string,
    cursor?: string | null,
  ): Promise<MessagePage>;
  send(
    conversationId: string,
    input: { content: string; client_message_id: string },
  ): Promise<{ message: Awaited<ReturnType<ChatApi["messages"]>>["items"][number] }>;
  markRead(conversationId: string, lastMessageId: string): Promise<{ read_at: string }>;
}

export interface ReviewsApi {
  create(
    orderId: string,
    input: { rating: number; comment: string | null; expected_version?: number },
  ): Promise<Review>;
  publicList(userId: string, page?: number): Promise<{ items: Review[]; meta: { total: number } }>;
}

export interface ReportsApi {
  create(input: ReportRequest): Promise<ReportRecord>;
  mine(): Promise<{ items: ReportRecord[] }>;
}

export interface NotificationsApi {
  list(query: { unread?: boolean; page?: number }): Promise<{
    items: Notification[];
    meta: { total: number; unread: number };
  }>;
  unreadCount(): Promise<number>;
  markRead(id: string): Promise<{ unread: number }>;
  markAllRead(): Promise<{ unread: number; updated: number }>;
}

export interface SupportApi {
  list(query: { status?: TicketStatus; page?: number }): Promise<{
    items: SupportTicketListItem[];
    meta: { total: number };
  }>;
  detail(id: string): Promise<SupportTicketDetail>;
  create(input: CreateSupportTicketInput): Promise<SupportTicketDetail>;
  reply(id: string, message: string): Promise<SupportTicketDetail>;
  close(id: string): Promise<SupportTicketDetail>;
}

export interface ProfilesApi {
  publicProfile(userId: string): Promise<PublicProfile>;
  products(userId: string, page?: number): Promise<ProductListResponse>;
}

export interface AdminApi {
  emailVerifications(query: { status?: "PENDING" | "APPROVED" | "ALL"; page?: number }): Promise<{ items: EmailVerificationRequest[]; meta: PageMeta }>;
  approveEmailVerification(id: string): Promise<EmailVerificationRequest>;
  dashboard(from: string, to: string): Promise<AdminDashboard>;
  users(query: {
    q?: string;
    status?: UserStatus;
    role?: UserRole;
    handled_by?: string;
    from?: string;
    to?: string;
    page?: number;
  }): Promise<{ items: AdminUserItem[]; meta: { total: number; page: number; page_size: number; total_pages: number } }>;
  user(id: string): Promise<AdminUserItem>;
  lockUser(id: string, reason: string): Promise<AdminUserItem>;
  unlockUser(id: string): Promise<AdminUserItem>;
  products(query: {
    status?: ProductStatus | "BLOCKED";
    category_id?: string;
    q?: string;
    seller_id?: string;
    handled_by?: string;
    from?: string;
    to?: string;
    page?: number;
  }): Promise<{ items: AdminProductItem[]; meta: { total: number; page: number; page_size: number; total_pages: number } }>;
  approveProduct(id: string, version: number): Promise<AdminProductItem>;
  rejectProduct(id: string, version: number, reason: string): Promise<AdminProductItem>;
  blockProduct(id: string, version: number, reason: string): Promise<AdminProductItem>;
  unblockProduct(id: string, version: number): Promise<AdminProductItem>;
  categoryTree(): Promise<CategoryNode[]>;
  categories(query: { q?: string; status?: "ACTIVE" | "INACTIVE"; handled_by?: string; from?: string; to?: string; page?: number }): Promise<{
    items: CategoryNode[];
    meta: { total: number; page: number; page_size: number; total_pages: number };
  }>;
  createCategory(input: {
    name: string;
    slug: string;
    parent_id: string | null;
  }): Promise<CategoryNode>;
  updateCategory(
    id: string,
    input: { name?: string; slug?: string; parent_id?: string | null; status?: "ACTIVE" | "INACTIVE" },
  ): Promise<CategoryNode>;
  reports(query: { status?: ReportStatus; reason?: ReportReason; target_type?: "product" | "user"; handled_by?: string; from?: string; to?: string; page?: number }): Promise<{
    items: AdminReportItem[];
    meta: { total: number; page: number; page_size: number; total_pages: number };
  }>;
  resolveReport(
    id: string,
    input: { resolution_note: string; action?: "block_product" | "lock_user" | "none" },
  ): Promise<AdminReportItem>;
  rejectReport(id: string, input: { resolution_note: string }): Promise<AdminReportItem>;
  reviews(query: { rating?: number; q?: string; visibility?: "VISIBLE" | "HIDDEN"; handled_by?: string; from?: string; to?: string; page?: number }): Promise<{
    items: AdminReviewItem[];
    meta: { total: number; page: number; page_size: number; total_pages: number };
  }>;
  hideReview(id: string, reason: string): Promise<AdminReviewItem>;
  tickets(query: { status?: TicketStatus; type?: TicketType; assigned_admin_id?: string; from?: string; to?: string; page?: number }): Promise<{
    items: AdminSupportTicketItem[];
    meta: { total: number; page: number; page_size: number; total_pages: number };
  }>;
  ticket(id: string): Promise<AdminSupportTicketDetail>;
  replyTicket(id: string, message: string): Promise<AdminSupportTicketDetail>;
  updateTicket(
    id: string,
    input: { status?: TicketStatus; assign?: boolean; resolution_note?: string },
  ): Promise<AdminSupportTicketDetail>;
  cancelOrder(id: string, input: AdminOrderCancelInput): Promise<AdminOrderCancelResult>;
  audit(query: { action?: string; entity_type?: string; entity_id?: string; actor_id?: string; from?: string; to?: string; page?: number }): Promise<{
    items: AuditLogItem[];
    meta: { total: number; page: number; page_size: number; total_pages: number };
  }>;
}

export type { SortOption };
