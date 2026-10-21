import type {
  CartApi,
  CheckoutApi,
  FavoritesApi,
  OrdersApi,
  ReviewsApi,
} from "./types.js";
import type { HttpTransport } from "./transport.js";
export function commerceEndpoints(http: HttpTransport) {
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
      http.post("/checkout", payload, undefined, {
        "Idempotency-Key": idempotencyKey,
      }),
  };

  const orders: OrdersApi = {
    list: (query) => http.get("/orders", { ...query }),
    detail: (id) => http.get(`/orders/${id}`),
    act: (id, action, body) =>
      http.post(`/orders/${id}/actions`, { action, ...body }),
  };

  const reviews: ReviewsApi = {
    create: (orderId, input) => http.post(`/orders/${orderId}/reviews`, input),
    publicList: (userId, page) =>
      http.get(`/users/${userId}/reviews`, { page }),
  };

  return { favorites, cart, checkout, orders, reviews };
}
