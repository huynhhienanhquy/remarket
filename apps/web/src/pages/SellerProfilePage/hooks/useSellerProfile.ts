import { useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/services/api";
import { queryKeys } from "@/config/queryClient";
import { useSession } from "@/contexts/SessionContext";
import { loginPathFor } from "@/config/route/guards";

/**
 * Owns seller-profile tabs, paginated data and favorite actions; inactive tab queries stay disabled.
 * Called once by the route component; hook order and handlers match the original page.
 */
export function useSellerProfile() {
  const { id = "" } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { viewer } = useSession();
  const [reportOpen, setReportOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const tab = searchParams.get("tab") === "reviews" ? "reviews" : "products";
  const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);

  const profile = useQuery({
    queryKey: queryKeys.profile(id),
    queryFn: () => api.profiles.publicProfile(id),
    enabled: id !== "",
  });

  const products = useQuery({
    queryKey: queryKeys.profileProducts(id, page),
    queryFn: () => api.profiles.products(id, page),
    enabled: id !== "" && tab === "products",
  });

  const reviews = useQuery({
    queryKey: queryKeys.userReviews(id, page),
    queryFn: () => api.reviews.publicList(id, page),
    enabled: id !== "" && tab === "reviews",
  });

  const favorites = useMutation({
    mutationFn: ({ productId, on }: { productId: string; on: boolean }) =>
      api.favorites.set(productId, on),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["products"] }),
  });

  function setTab(next: "products" | "reviews") {
    const params = new URLSearchParams(searchParams);
    params.set("tab", next);
    params.delete("page");
    setSearchParams(params, { replace: true });
  }

  function toggleFavorite(productId: string, on: boolean) {
    if (!viewer) {
      navigate(loginPathFor(`/users/${id}`, searchParams.toString()));
      return;
    }
    favorites.mutate({ productId, on });
  }
  return {
    id,
    searchParams,
    setSearchParams,
    navigate,
    viewer,
    reportOpen,
    setReportOpen,
    menuOpen,
    setMenuOpen,
    tab,
    page,
    profile,
    products,
    reviews,
    setTab,
    toggleFavorite,
  };
}
