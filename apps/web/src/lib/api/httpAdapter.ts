import type { SessionUser } from "@remarket/shared";
import type {
  ApiAdapter,
  AuthApi,
  CartApi,
  CategoriesApi,
  ChatApi,
  CheckoutApi,
  FavoritesApi,
  NotificationsApi,
  OrdersApi,
  ProductInput,
  ProductsApi,
  ProfilesApi,
  ReportsApi,
  ReviewsApi,
  SupportApi,
  UploadsApi,
} from "./contract";
import { ApiError } from "../errors";
import { http } from "./http";
import { updateSessionUser } from "./session";

/** Post-login bootstrap expects a session; a 401 there means login failed. */
function requireSession(user: SessionUser | null): SessionUser {
  if (user === null) {
    throw new ApiError({
      code: "UNAUTHORIZED",
      message: "Phiên đăng nhập chưa hợp lệ.",
      status: 401,
    });
  }
  return user;
}

/**
 * Live implementation of the adapter contract. Every method maps 1:1 to a
 * documented endpoint (detail-project 14.1); it is selected with
 * VITE_API_MODE=live and is never mixed with the mock adapter in a session.
 */

const auth: AuthApi = {
  /** One shared cookie restore, with 200/null for an anonymous visitor. */
  bootstrap: () => http.restoreSession(),
  me: async () => {
    const user = await http.getOrNull<SessionUser>("/auth/me");
    updateSessionUser(user);
    return user;
  },
  register: (input) => http.post("/auth/register", input),
  login: async (email, password) => {
    const data = await http.post<{ access_token: string; user?: SessionUser }>("/auth/login", {
      email,
      password,
    });
    http.setAccessToken(data.access_token);
    if (data.user) {
      updateSessionUser(data.user);
      return data.user;
    }
    return requireSession(await auth.me());
  },
  logout: async () => {
    await http.post("/auth/logout");
    http.setAccessToken(null);
  },
  logoutAll: async () => {
    await http.post("/auth/logout-all");
    http.setAccessToken(null);
  },
  verifyEmail: async (token) => {
    const data = await http.post<{ access_token: string }>("/auth/verify-email", { token });
    if (data.access_token) http.setAccessToken(data.access_token);
    return requireSession(await auth.me());
  },
  resendVerification: (email) => http.post("/auth/resend-verification", { email }),
  emailVerificationRequest: () => http.get("/auth/email-verification-request"),
  requestEmailVerification: () => http.post("/auth/email-verification-request", {}),
  forgotPassword: (email) => http.post("/auth/forgot-password", { email }),
  resetPassword: (token, password) =>
    http.post("/auth/reset-password", { token, password }),
  updateProfile: (input) => http.patch("/auth/profile", input),
  uploadAvatar: (storagePath) => http.patch("/auth/avatar", { storage_path: storagePath }),
};

const categories: CategoriesApi = {
  tree: () => http.get("/categories"),
  provinces: () => http.get("/provinces"),
};

const products: ProductsApi = {
  list: (query) => http.get("/products", { ...query }),
  detail: (id) => http.get(`/products/${id}`),
  mine: (query) => http.get("/account/products", { ...query }),
  create: (input: ProductInput) => http.post("/products", input),
  update: (id, input, expectedVersion) =>
    http.patch(`/products/${id}`, { ...input, expected_version: expectedVersion }),
  submit: (id) => http.post(`/products/${id}/submit`),
  hide: (id) => http.post(`/products/${id}/hide`),
  remove: (id) => http.delete(`/products/${id}`),
};

const uploads: UploadsApi = {
  upload: (file, purpose) => {
    const form = new FormData();
    form.append("file", file);
    form.append("purpose", purpose);
    return http.post("/uploads", form);
  },
};

const favorites: FavoritesApi = {
  list: (page) => http.get("/favorites", { page }),
  set: (productId, on) =>
    on
      ? http.put(`/favorites/${productId}`)
      : http.delete(`/favorites/${productId}`),
};

const cart: CartApi = {
  get: () => http.get("/cart"),
  add: (productId) => http.post(`/cart/items`, { product_id: productId }),
  remove: (productId) => http.delete(`/cart/items/${productId}`),
};

const checkout: CheckoutApi = {
  create: (payload, idempotencyKey) =>
    http.post("/checkout", payload, undefined, { "Idempotency-Key": idempotencyKey }),
};

const orders: OrdersApi = {
  list: (query) => http.get("/orders", { ...query }),
  detail: (id) => http.get(`/orders/${id}`),
  act: (id, action, body) => http.post(`/orders/${id}/actions`, { action, ...body }),
};

const chat: ChatApi = {
  conversations: (page) => http.get("/conversations", { page }),
  detail: (id) => http.get(`/conversations/${id}`),
  open: (productId) => http.post("/conversations", { product_id: productId }),
  messages: (conversationId, cursor) =>
    http.get(`/conversations/${conversationId}/messages`, { cursor: cursor ?? undefined }),
  send: (conversationId, input) =>
    http.post(`/conversations/${conversationId}/messages`, input),
  markRead: (conversationId, lastMessageId) =>
    http.post(`/conversations/${conversationId}/read`, { last_message_id: lastMessageId }),
};

const reviews: ReviewsApi = {
  create: (orderId, input) => http.post(`/orders/${orderId}/reviews`, input),
  publicList: (userId, page) => http.get(`/users/${userId}/reviews`, { page }),
};

const reports: ReportsApi = {
  create: (input) => http.post("/reports", input),
  mine: () => http.get("/reports/mine"),
};

const notifications: NotificationsApi = {
  list: (query) =>
    http.get("/notifications", {
      page: query.page,
      unread: query.unread ? "true" : undefined,
    }),
  unreadCount: () => http.get("/notifications/unread-count"),
  markRead: (id) => http.post(`/notifications/${id}/read`),
  markAllRead: () => http.post("/notifications/read-all"),
};

const support: SupportApi = {
  list: (query) => http.get("/support/tickets", { ...query }),
  detail: (id) => http.get(`/support/tickets/${id}`),
  create: (input) => http.post("/support/tickets", input),
  reply: (id, message) => http.post(`/support/tickets/${id}/messages`, { message }),
  close: (id) => http.post(`/support/tickets/${id}/close`),
};

const profiles: ProfilesApi = {
  publicProfile: (userId) => http.get(`/users/${userId}`),
  products: (userId, page) => http.get(`/users/${userId}/products`, { page }),
};

const admin: ApiAdapter["admin"] = {
  emailVerifications: (query) => http.get("/admin/email-verifications", { ...query }),
  approveEmailVerification: (id) => http.post(`/admin/email-verifications/${id}/approve`, {}),
  dashboard: (from, to) => http.get("/admin/dashboard", { from, to }),
  users: (query) => http.get("/admin/users", { ...query }),
  user: (id) => http.get(`/admin/users/${id}`),
  lockUser: (id, reason) => http.post(`/admin/users/${id}/lock`, { reason }),
  unlockUser: (id) => http.post(`/admin/users/${id}/unlock`),
  products: (query) => http.get("/admin/products", { ...query }),
  approveProduct: (id, version) =>
    http.post(`/admin/products/${id}/approve`, { expected_version: version }),
  rejectProduct: (id, version, reason) =>
    http.post(`/admin/products/${id}/reject`, { expected_version: version, reason }),
  blockProduct: (id, version, reason) => http.post(`/admin/products/${id}/block`, { expected_version: version, reason }),
  unblockProduct: (id, version) => http.post(`/admin/products/${id}/unblock`, { expected_version: version }),
  createCategory: (input) => http.post("/admin/categories", input),
  categoryTree: () => http.get("/admin/categories/tree"),
  categories: (query) => http.get("/admin/categories", { ...query }),
  updateCategory: (id, input) => http.patch(`/admin/categories/${id}`, input),
  reports: (query) => http.get("/admin/reports", { ...query }),
  resolveReport: (id, input) => http.post(`/admin/reports/${id}/resolve`, input),
  rejectReport: (id, input) => http.post(`/admin/reports/${id}/reject`, input),
  reviews: (query) => http.get("/admin/reviews", { ...query }),
  hideReview: (id, reason) => http.post(`/admin/reviews/${id}/hide`, { reason }),
  tickets: (query) => http.get("/admin/support-tickets", { ...query }),
  ticket: (id) => http.get(`/admin/support-tickets/${id}`),
  replyTicket: (id, message) => http.post(`/admin/support-tickets/${id}/messages`, { message }),
  updateTicket: (id, input) => http.patch(`/admin/support-tickets/${id}`, input),
  cancelOrder: (id, input) => http.post(`/admin/orders/${id}/cancel`, input),
  audit: (query) => http.get("/admin/audit-logs", { ...query }),
};

export function createHttpAdapter(): ApiAdapter {
  return {
    auth,
    categories,
    products,
    uploads,
    favorites,
    cart,
    checkout,
    orders,
    chat,
    reviews,
    reports,
    notifications,
    support,
    profiles,
    admin,
  };
}
