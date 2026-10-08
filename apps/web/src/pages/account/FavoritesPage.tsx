import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { api } from "../../lib/api";
import { queryKeys } from "../../lib/queryClient";
import { EmptyState, Pagination, ProductCard, useToast } from "../../components/ui";
import { ListLoading, OfflineNotice, QueryFailure, urlPage, useConnectivity } from "../../components/features/PageFeedback";

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
  return <div className="space-y-6 py-6">
    <h1 className="t-h1">Sản phẩm yêu thích</h1><OfflineNotice online={online} />
    {remove.isError && <QueryFailure error={remove.error} />}
    {favorites.isPending ? <ListLoading /> : favorites.isError ? <QueryFailure error={favorites.error} retry={() => void favorites.refetch()} /> : favorites.data.items.length === 0 ?
      <EmptyState title="Bạn chưa lưu món đồ nào" action={{ label: "Khám phá sản phẩm", to: "/products" }} /> : <>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4" aria-busy={remove.isPending}>
          {favorites.data.items.map((product) => <div key={product.id}>
            <ProductCard product={product} onToggleFavorite={() => { if (online && !remove.isPending) remove.mutate(product.id); }} />
          </div>)}
        </div>
        <Pagination page={page} totalPages={favorites.data.meta.total_pages} total={favorites.data.meta.total} onPageChange={(next) => setParams({ page: String(next) })} />
      </>}
  </div>;
}
