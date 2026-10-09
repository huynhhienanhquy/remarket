import { readFilters, countFilters, buildChips } from "@/pages/SearchPage/filters";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ProductListItem } from "@remarket/shared";
import { api } from "@/services/api";
import { queryKeys } from "@/config/queryClient";
import { useSession } from "@/contexts/SessionContext";
import { loginPathFor } from "@/config/route/guards";
import { type FilterValues } from "@/pages/SearchPage/sections/FilterPanel";

const PAGE_SIZE = 12;

/**
 * Owns URL filters, draft-sheet state and catalogue queries with the existing cache keys.
 * Called once by the route component; hook order and handlers match the original page.
 */
export function useProductSearch() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { viewer } = useSession();

  const q = searchParams.get("q") ?? "";
  const sort = (searchParams.get("sort") ?? "newest") as "newest" | "price_asc" | "price_desc";
  const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
  const filters = useMemo(() => readFilters(searchParams), [searchParams]);

  const [keyword, setKeyword] = useState(q);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [draft, setDraft] = useState<FilterValues>(filters);

  useEffect(() => setKeyword(q), [q]);
  // Discard unapplied sheet edits whenever it is reopened (ui-spec 8).
  useEffect(() => {
    if (sheetOpen) setDraft(filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetOpen]);

  const categories = useQuery({
    queryKey: queryKeys.categories,
    queryFn: () => api.categories.tree(),
    staleTime: 5 * 60_000,
  });
  const provinces = useQuery({
    queryKey: queryKeys.provinces,
    queryFn: () => api.categories.provinces(),
    staleTime: 5 * 60_000,
  });

  const categoryNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const root of categories.data ?? []) {
      map.set(root.id, root.name);
      for (const child of root.children ?? []) map.set(child.id, child.name);
    }
    return map;
  }, [categories.data]);
  const provinceNames = useMemo(
    () => new Map((provinces.data ?? []).map((entry) => [entry.code, entry.name])),
    [provinces.data],
  );

  /** Writes filters/sort/search to the URL; every filter change resets page. */
  const applyParams = useCallback(
    (patch: Record<string, string | null>, options?: { replace?: boolean }) => {
      const next = new URLSearchParams(searchParams);
      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === "") next.delete(key);
        else next.set(key, value);
      }
      if (!("page" in patch)) next.delete("page");
      setSearchParams(next, { replace: options?.replace ?? false });
    },
    [searchParams, setSearchParams],
  );

  const listQuery = useQuery({
    queryKey: queryKeys.products({ ...Object.fromEntries(searchParams), page_size: PAGE_SIZE }),
    queryFn: () =>
      api.products.list({
        q: q || undefined,
        category_id: filters.category_id || undefined,
        min_price: filters.min_price || undefined,
        max_price: filters.max_price || undefined,
        condition: filters.condition || undefined,
        province_code: filters.province_code || undefined,
        delivery_method: filters.delivery_method || undefined,
        sort,
        page,
        page_size: PAGE_SIZE,
      }),
    placeholderData: keepPreviousData,
    staleTime: 10_000,
  });

  const favorites = useMutation({
    mutationFn: ({ id, on }: { id: string; on: boolean }) => api.favorites.set(id, on),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["products"] }),
  });

  function toggleFavorite(product: ProductListItem) {
    if (!viewer) {
      navigate(loginPathFor(location.pathname, location.search));
      return;
    }
    favorites.mutate({ id: product.id, on: !product.is_favorited });
  }

  function submitKeyword() {
    applyParams({ q: keyword.trim() || null });
  }

  function clearFilters() {
    const next = new URLSearchParams(searchParams);
    for (const key of ["category_id", "min_price", "max_price", "condition", "province_code", "delivery_method"]) {
      next.delete(key);
    }
    next.delete("page");
    setSearchParams(next);
  }

  function removeChip(key: keyof FilterValues) {
    if (key === "min_price") applyParams({ min_price: null, max_price: null });
    else applyParams({ [key]: null });
  }

  const chips = buildChips(filters, categoryNames, provinceNames);
  const activeCount = countFilters(filters);
  const items = listQuery.data?.items ?? [];
  const meta = listQuery.data?.meta;
  const isRefetching = listQuery.isFetching && !listQuery.isPending;
  const filtered = activeCount > 0 || q !== "";

  const title = q ? `Kết quả cho '${q}'` : "Khám phá sản phẩm";
  return {
    q,
    sort,
    filters,
    keyword,
    setKeyword,
    sheetOpen,
    setSheetOpen,
    draft,
    setDraft,
    categories,
    provinces,
    applyParams,
    listQuery,
    toggleFavorite,
    submitKeyword,
    clearFilters,
    removeChip,
    chips,
    activeCount,
    items,
    meta,
    isRefetching,
    filtered,
    title,
  };
}
