import type { QueryClient } from "@tanstack/react-query";

type AdminResource = "dashboard" | "products" | "reports" | "reviews" | "users" | "tickets" | "categories" | "audit";

/** Invalidate the complete resource, including its list and detail queries. */
export function invalidateAdminResources(client: QueryClient, ...resources: AdminResource[]) {
  return Promise.all([...new Set(resources)].map((resource) => client.invalidateQueries({ queryKey: ["admin", resource] })));
}

/** Patch visible rows immediately; callers then invalidate affected resources. */
export function patchAdminRows<T extends { id: string }>(client: QueryClient, resource: AdminResource, updated: T) {
  client.setQueriesData<{ items: T[]; meta: unknown }>({ queryKey: ["admin", resource] }, (current) =>
    current && Array.isArray(current.items) ? { ...current, items: current.items.map((item) => item.id === updated.id ? { ...item, ...updated } : item) } : current);
}
