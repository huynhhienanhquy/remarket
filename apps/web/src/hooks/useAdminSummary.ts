import { useQuery } from "@tanstack/react-query";
import type { AdminNavigationCounts, AdminWorkspaceSummary } from "@remarket/shared";
import { useOutletContext } from "react-router-dom";
import { apiForQuery } from "@/services/api";

export function useAdminSummary<K extends keyof AdminWorkspaceSummary>(section: K) {
  return useQuery({
    queryKey: ["admin", "summary", section],
    queryFn: ({ signal }) => apiForQuery(signal).admin.summary(section),
    staleTime: 30_000,
    retry: false,
  });
}

export function useAdminQueueCounts() {
  return useOutletContext<AdminNavigationCounts | undefined>();
}

const percentage = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 });

export function formatAdminPercent(value: number | null | undefined) {
  return value == null ? undefined : percentage.format(value) + "%";
}
