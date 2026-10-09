import { FILTERS } from "@/pages/MyProductsPage/filters";
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { ProductAction } from "@remarket/shared";
import { api } from "@/services/api";
import { queryKeys } from "@/config/queryClient";
import { useSession } from "@/contexts/SessionContext";
import { useToast } from "@/components/common";
import { urlPage } from "@/utils/urlPage";
import { useConnectivity } from "@/hooks/useConnectivity";

/**
 * Owns listing filters and moderation mutations; removing the last item keeps the existing page fallback.
 * Called once by the route component; hook order and handlers match the original page.
 */
export function useOwnProducts() {
  const navigate = useNavigate();
  const { viewer } = useSession();
  const toast = useToast();
  const client = useQueryClient();
  const online = useConnectivity();
  const refreshProducts = () => { for (const key of ["products", "profiles", "cart", "favorites"]) void client.invalidateQueries({ queryKey: [key] }); };

  const [params, setParams] = useSearchParams();
  const status = FILTERS.find((entry) => entry === params.get("status")) ?? "ALL";
  const page = urlPage(params.get("page"));
  const setPage = (next: number) => { const updated = new URLSearchParams(params); updated.set("page", String(next)); setParams(updated); };
  const [dialog, setDialog] = useState<{ open: boolean; productId: string; action: "delete" | "hide" } | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.ownProducts({ status, page }),
    queryFn: () => api.products.mine({ status: status === "ALL" ? undefined : status, page, page_size: 12 } as const),
    enabled: !!viewer,
  });

  const hideMutation = useMutation({
    mutationFn: (productId: string) => api.products.hide(productId),
    onSuccess: () => {
      toast.success("Đã ẩn tin đăng.");
      refreshProducts(); setDialog(null);
    },
    onError: (error: unknown) => toast.error(error instanceof Error ? error.message : "Không thể ẩn tin."),
  });

  const deleteMutation = useMutation({
    mutationFn: (productId: string) => api.products.remove(productId),
    onSuccess: () => {
      toast.success("Đã xóa tin đăng.");
      refreshProducts(); setDialog(null);
      if (data?.items.length === 1 && page > 1) setPage(page - 1);
    },
    onError: (error: unknown) => toast.error(error instanceof Error ? error.message : "Không thể xóa tin."),
  });

  const submitMutation = useMutation({
    mutationFn: (productId: string) => api.products.submit(productId),
    onSuccess: () => { toast.success("Đã gửi duyệt lại."); refreshProducts(); },
    onError: (error: unknown) => toast.error(error instanceof Error ? error.message : "Không thể gửi duyệt."),
  });

  const handleAction = (action: ProductAction, productId: string) => {
    if (!online || hideMutation.isPending || deleteMutation.isPending || submitMutation.isPending) return;
    if (action === "hide") {
      setDialog({ open: true, productId, action: "hide" });
    } else if (action === "delete") {
      setDialog({ open: true, productId, action: "delete" });
    } else if (action === "submit" || action === "resubmit") {
      if (!submitMutation.isPending) submitMutation.mutate(productId);
    }
  };

  const confirmDialogAction = () => {
    if (!dialog || !online || hideMutation.isPending || deleteMutation.isPending) return;
    if (dialog.action === "hide") hideMutation.mutate(dialog.productId);
    else if (dialog.action === "delete") deleteMutation.mutate(dialog.productId);
  };
  return {
    navigate,
    viewer,
    online,
    setParams,
    status,
    page,
    setPage,
    dialog,
    setDialog,
    data,
    isLoading,
    error,
    refetch,
    hideMutation,
    deleteMutation,
    submitMutation,
    handleAction,
    confirmDialogAction,
  };
}
