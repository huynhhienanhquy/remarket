import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { api } from "../../services/runtime";
import { useSession } from "../../services/session-context";
import {
  Screen,
  Feedback,
  LoginPrompt,
  ProductGrid,
  Pagination,
  Button,
  EmptyState,
  ProductGridSkeleton,
} from "../../components/ui";
export default function Favorites() {
  const { user } = useSession();
  const router = useRouter();
  const [page, setPage] = useState(1);
  const result = useQuery({
    queryKey: ["favorites", user?.id, page],
    queryFn: () => api.favorites.list(page),
    enabled: !!user,
  });
  return (
    <Screen
      title="Yêu thích"
      description="Những món đồ bạn đã lưu để xem lại và mua sau."
      titleCard
      onRefresh={() => {
        void result.refetch();
      }}
      refreshing={result.isRefetching}
    >
      {!user ? (
        <LoginPrompt />
      ) : (
        <>
          {result.isPending && <ProductGridSkeleton />}
          <Feedback
            error={result.error}
            retry={() => {
              void result.refetch();
            }}
          />
          {result.data?.items.length === 0 && (
            <EmptyState
              icon="heart-outline"
              title="Chưa có món đồ yêu thích"
              description="Chạm vào trái tim trên món đồ để lưu lại."
              action={
                <Button
                  title="Khám phá sản phẩm"
                  onPress={() => router.push("/products")}
                />
              }
            />
          )}
          {result.data && (
            <>
              <ProductGrid items={result.data.items} />
              <Pagination
                page={page}
                total={result.data.meta.total}
                pageSize={result.data.meta.page_size}
                onChange={setPage}
              />
            </>
          )}
        </>
      )}
    </Screen>
  );
}
