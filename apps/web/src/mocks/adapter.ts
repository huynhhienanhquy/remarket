import type { ApiAdapter } from "../lib/api/contract";
import { adminApi } from "./adapter-admin";
import { authApi, categoriesApi, uploadsApi } from "./adapter-auth";
import { cartApi, favoritesApi, productsApi } from "./adapter-products";
import { chatApi } from "./adapter-chat";
import { checkoutApi } from "./adapter-checkout";
import { ordersApi } from "./adapter-orders";
import {
  notificationsApi,
  profilesApi,
  reportsApi,
  reviewsApi,
} from "./adapter-social";
import { supportApi } from "./adapter-support";

/**
 * Mock implementation of the full adapter contract (ui-spec 1 and 27).
 * Fixtures are loaded lazily by `store.db()` so the first request seeds the
 * in-memory database; `resetDb()` restores the documented starting state.
 */
export function createMockAdapter(): ApiAdapter {
  return {
    auth: authApi,
    categories: categoriesApi,
    products: productsApi,
    uploads: uploadsApi,
    favorites: favoritesApi,
    cart: cartApi,
    checkout: checkoutApi,
    orders: ordersApi,
    chat: chatApi,
    reviews: reviewsApi,
    reports: reportsApi,
    notifications: notificationsApi,
    support: supportApi,
    profiles: profilesApi,
    admin: adminApi,
  };
}
