import type { ApiAdapter } from "@/types/api";
import { http } from "@/services/http";

export const admin: ApiAdapter["admin"] = {
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
