import type { CartApi, CheckoutApi, FavoritesApi, OrdersApi, ReviewsApi } from "@/types/api";
import { http } from "@/services/http";

export const favorites: FavoritesApi = {
  list: (page) => http.get("/favorites", { page }),
  set: (productId, on) =>
    on
      ? http.put(`/favorites/${productId}`)
      : http.delete(`/favorites/${productId}`),
};

export const cart: CartApi = {
  get: () => http.get("/cart"),
  add: (productId) => http.post(`/cart/items`, { product_id: productId }),
  remove: (productId) => http.delete(`/cart/items/${productId}`),
};

export const checkout: CheckoutApi = {
  create: (payload, idempotencyKey) =>
    http.post("/checkout", payload, undefined, { "Idempotency-Key": idempotencyKey }),
};

export const orders: OrdersApi = {
  list: (query) => http.get("/orders", { ...query }),
  detail: (id) => http.get(`/orders/${id}`),
  act: (id, action, body) => http.post(`/orders/${id}/actions`, { action, ...body }),
};

export const reviews: ReviewsApi = {
  create: (orderId, input) => http.post(`/orders/${orderId}/reviews`, input),
  publicList: (userId, page) => http.get(`/users/${userId}/reviews`, { page }),
};
