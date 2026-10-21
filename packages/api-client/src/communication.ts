import type {
  ChatApi,
  NotificationsApi,
  ReportsApi,
  SupportApi,
} from "./types.js";
import type { HttpTransport } from "./transport.js";
export function communicationEndpoints(http: HttpTransport) {
  const chat: ChatApi = {
    unreadCount: () => http.get("/conversations/unread-count"),
    conversations: (page) => http.get("/conversations", { page }),
    detail: (id) => http.get(`/conversations/${id}`),
    open: (productId) => http.post("/conversations", { product_id: productId }),
    messages: (conversationId, cursor) =>
      http.get(`/conversations/${conversationId}/messages`, {
        cursor: cursor ?? undefined,
      }),
    send: (conversationId, input) =>
      http.post(`/conversations/${conversationId}/messages`, input),
    markRead: (conversationId, lastMessageId) =>
      http.post(`/conversations/${conversationId}/read`, {
        last_message_id: lastMessageId,
      }),
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
    reply: (id, message) =>
      http.post(`/support/tickets/${id}/messages`, { message }),
    close: (id) => http.post(`/support/tickets/${id}/close`),
  };

  return { chat, reports, notifications, support };
}
