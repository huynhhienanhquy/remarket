import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { api } from "../../lib/api";
import { queryKeys } from "../../lib/queryClient";
import { Pagination, ProductCard, ProductCardSkeleton, useToast } from "../../components/ui";
import { OfflineNotice, QueryFailure, urlPage, useConnectivity } from "../../components/features/PageFeedback";
import { AccountEmptyState, AccountPageHeader } from "../../components/features/AccountPageHeader";

export function FavoritesPage() {
  const [params, setParams] = useSearchParams();
  const page = urlPage(params.get("page"));
  const client = useQueryClient();
  const toast = useToast();
  const online = useConnectivity();
  const favorites = useQuery({ queryKey: queryKeys.favorites(page), queryFn: () => api.favorites.list(page) });
  const remove = useMutation({
    mutationFn: (id: string) => api.favorites.set(id, false),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["favorites"] });
      await client.invalidateQueries({ queryKey: ["products"] });
      if (favorites.data?.items.length === 1 && page > 1) setParams({ page: String(page - 1) });
      toast.success("Đã bỏ lưu sản phẩm");
    },
  });
  return <div className="space-y-6">
    <AccountPageHeader title="Yêu thích" description="Những món đồ bạn đã lưu để xem lại và mua sau." /><OfflineNotice online={online} />
    {remove.isError && <QueryFailure error={remove.error} />}
    {favorites.isPending ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-5 xl:grid-cols-4" aria-busy="true" aria-label="Đang tải sản phẩm yêu thích">{Array.from({ length: 6 }, (_, index) => <ProductCardSkeleton key={index} />)}</div> : favorites.isError ? <QueryFailure error={favorites.error} retry={() => void favorites.refetch()} /> : favorites.data.items.length === 0 ?
      <AccountEmptyState icon="heart" title="Bạn chưa lưu món đồ nào" description="Chạm vào biểu tượng trái tim trên món đồ bạn thích. Những món đã lưu sẽ xuất hiện tại đây." action={{ label: "Khám phá sản phẩm", to: "/products" }} /> : <>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-5 xl:grid-cols-4" aria-busy={remove.isPending}>
          {favorites.data.items.map((product) => <div key={product.id}>
            <ProductCard className="rounded-2xl shadow-subtle" product={product} onToggleFavorite={() => { if (online && !remove.isPending) remove.mutate(product.id); }} />
          </div>)}
        </div>
        <Pagination page={page} totalPages={favorites.data.meta.total_pages} total={favorites.data.meta.total} onPageChange={(next) => setParams({ page: String(next) })} />
      </>}
  </div>;
}
