import { QueryClient } from "@tanstack/react-query";
import { isNonRetryable } from "./errors";

/**
 * Server state goes through one query cache (ui-spec 26). 4xx responses are
 * never retried — the request cannot succeed by repeating it — while 5xx and
 * network failures retry twice with the default backoff.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: (failureCount, error) =>
          !isNonRetryable(error) && failureCount < 2,
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        throwOnError: false,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

/**
 * Query keys always start with the viewer so a session change can drop every
 * private key at once without touching public catalogue data.
 */
export const queryKeys = {
  viewer: ["session", "viewer"] as const,
  categories: ["categories"] as const,
  provinces: ["provinces"] as const,
  products: (query: unknown) => ["products", "list", query] as const,
  product: (id: string) => ["products", "detail", id] as const,
  ownProducts: (query: unknown) => ["products", "own", query] as const,
  favorites: (page: number) => ["favorites", page] as const,
  cart: ["cart"] as const,
  orders: (role: string, status: string, page: number) =>
    ["orders", role, status, page] as const,
  order: (id: string) => ["orders", "detail", id] as const,
  conversations: (page: number) => ["chat", "conversations", page] as const,
  messages: (conversationId: string) => ["chat", "messages", conversationId] as const,
  notifications: (unread: boolean, page: number) =>
    ["notifications", unread, page] as const,
  unreadCount: ["notifications", "unread-count"] as const,
  support: (status: string, page: number) => ["support", "list", status, page] as const,
  ticket: (id: string) => ["support", "detail", id] as const,
  profile: (id: string) => ["profiles", id] as const,
  profileProducts: (id: string, page: number) => ["profiles", id, "products", page] as const,
  userReviews: (id: string, page: number) => ["profiles", id, "reviews", page] as const,
  myReports: ["reports", "mine"] as const,
  adminDashboard: (from: string, to: string) => ["admin", "dashboard", from, to] as const,
  adminUsers: (query: unknown) => ["admin", "users", "list", query] as const,
  adminUser: (id: string) => ["admin", "users", "detail", id] as const,
  adminProducts: (query: unknown) => ["admin", "products", query] as const,
  adminCategoryTree: ["admin", "categories", "tree"] as const,
  adminCategories: (query: unknown) => ["admin", "categories", "list", query] as const,
  adminReports: (query: unknown) => ["admin", "reports", query] as const,
  adminReviews: (query: unknown) => ["admin", "reviews", query] as const,
  adminTickets: (query: unknown) => ["admin", "tickets", "list", query] as const,
  adminTicket: (id: string) => ["admin", "tickets", "detail", id] as const,
  adminAudit: (query: unknown) => ["admin", "audit", query] as const,
} as const;
