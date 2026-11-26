import { useCallback, useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { apiForQuery } from "../../services/api";
import { queryKeys } from "../../config/queryClient";
import { MarketplaceHeader } from "../../components/MarketplaceHeader/MarketplaceHeader";
import { MobileBottomNav } from "../../components/MobileBottomNav/MobileBottomNav";
import { MarketplaceAiLauncher } from "../../components/MarketplaceAi/MarketplaceAiLauncher";
import { Footer } from "../../components/Footer/Footer";
import { useSession } from "../../contexts/SessionContext";
import { aiEndpoints } from "@remarket/api-client";
import { http } from "../../services/http";

const readAiConfig = aiEndpoints(http).config;

/** Discovery pages keep footer + search row; deep task pages drop both. */
function isDiscovery(pathname: string): boolean {
  return (
    pathname === "/" ||
    pathname === "/products" ||
    pathname.startsWith("/users/")
  );
}

/**
 * MarketplaceShell: header + category nav + optional mobile search row,
 * footer on discovery pages, and the mobile bottom navigation (ui-spec 3.1).
 */
export function MarketplaceShell() {
  const { status, viewer } = useSession();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState(() => searchParams.get("q") ?? "");
  const discovery = isDiscovery(location.pathname);

  // Keep the header field in sync when the URL query changes elsewhere.
  useEffect(() => {
    setSearch(searchParams.get("q") ?? "");
  }, [searchParams]);

  const { data: categories } = useQuery({
    queryKey: queryKeys.categories,
    queryFn: ({ signal }) => apiForQuery(signal).categories.tree(),
    enabled: discovery && status === "ready",
    staleTime: 5 * 60_000,
  });
  const { data: aiConfig } = useQuery({
    queryKey: ["ai-config", viewer?.id],
    queryFn: readAiConfig,
    enabled: status === "ready" && viewer?.status === "ACTIVE",
    staleTime: 60_000,
    retry: false,
  });

  const submitSearch = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    if (search.trim() === "") next.delete("q");
    else next.set("q", search.trim());
    next.delete("page");
    const query = next.toString();
    navigate(query ? `/products?${query}` : "/products");
  }, [navigate, search, searchParams]);

  const footerVisible =
    discovery || /^\/products\/[^/]+$/.test(location.pathname);

  return (
    <div className="flex min-h-screen flex-col">
      <MarketplaceHeader
        search={search}
        onSearchChange={setSearch}
        onSearchSubmit={submitSearch}
        categories={categories ?? []}
        showSearchRow={discovery}
        showCategories={discovery}
      />
      <main className="flex-1">
        <Outlet />
      </main>
      {footerVisible && <Footer deferCategories={!discovery} />}
      <MobileBottomNav />
      {viewer?.status === "ACTIVE" && aiConfig?.enabled && (
        <MarketplaceAiLauncher key={viewer.id} userId={viewer.id} />
      )}
    </div>
  );
}
