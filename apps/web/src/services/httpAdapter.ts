import type { ApiAdapter } from "../types/api";
import { auth } from "./endpoints/auth";
import { categories, products, uploads, profiles } from "./endpoints/catalog";
import { favorites, cart, checkout, orders, reviews } from "./endpoints/commerce";
import { chat, reports, notifications, support } from "./endpoints/communication";
import { admin } from "./endpoints/admin";

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
