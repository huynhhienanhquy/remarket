import { useState } from "react";
import { Text, View, Alert } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { formatDate, formatDateTime } from "@remarket/shared";
import { api, http } from "../../services/runtime";
import { useSession, queryClient } from "../../services/session-context";
import { MarketplaceImage } from "../../components/MarketplaceImage";
import { ReportSheet } from "../../components/ReportSheet";
import {
  Screen,
  Button,
  Feedback,
  ProductGrid,
  Pagination,
  EmptyState,
  useAction,
  styles,
  colors,
} from "../../components/ui";
export default function Profile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useSession();
  const action = useAction();
  const [page, setPage] = useState(1);
  const [reviewPage, setReviewPage] = useState(1);
  const [tab, setTab] = useState<"products" | "reviews">("products");
  const [report, setReport] = useState(false);
  const profile = useQuery({
    queryKey: ["profiles", id],
    queryFn: () => api.profiles.publicProfile(id),
  });
  const products = useQuery({
    queryKey: ["products", "seller", id, user?.id, page],
    queryFn: () => api.profiles.products(id, page),
    enabled: tab === "products",
  });
  const reviews = useQuery({
    queryKey: ["reviews", id, reviewPage],
    queryFn: () => api.reviews.publicList(id, reviewPage),
    enabled: tab === "reviews",
  });
  const seller = profile.data?.seller;
  return (
    <Screen title="Hồ sơ người bán">
      <Feedback
        loading={profile.isPending}
        error={profile.error ?? action.error}
        retry={() => {
          void profile.refetch();
        }}
      />
      {seller && (
        <View style={[styles.card, { backgroundColor: colors.soft }]}>
          <View style={styles.row}>
            {seller.avatar_url && (
              <MarketplaceImage
                uri={seller.avatar_url}
                style={{ width: 64, height: 64, borderRadius: 32 }}
              />
            )}
            <Text style={styles.heading}>{seller.name}</Text>
          </View>
          <Text style={styles.muted}>
            {seller.province_label} · Tham gia {formatDate(seller.joined_at)}
          </Text>
          <Text style={styles.text}>
            {seller.rating === null
              ? "Chưa có đánh giá"
              : `${seller.rating.toFixed(1)} / 5 · ${seller.review_count} đánh giá`}
          </Text>
          <Text style={styles.text}>
            {seller.completed_sales_count} giao dịch hoàn tất
          </Text>
        </View>
      )}
      {user && user.id !== id && (
        <View style={styles.row}>
          <Button
            title="Báo cáo người dùng"
            secondary
            onPress={() => setReport(true)}
          />
          <Button
            title="Chặn người dùng"
            danger
            disabled={action.pending}
            onPress={() =>
              Alert.alert(
                "Chặn người dùng",
                "Hai tài khoản sẽ không thể gửi tin nhắn mới cho nhau. Các đơn hiện có vẫn được xử lý.",
                [
                  { text: "Hủy", style: "cancel" },
                  {
                    text: "Chặn",
                    style: "destructive",
                    onPress: () => {
                      void action.run(async () => {
                        await http.put(`/mobile/blocks/${id}`);
                        await queryClient.invalidateQueries();
                      }, "Đã chặn người dùng.");
                    },
                  },
                ],
              )
            }
          />
        </View>
      )}
      <View style={styles.row}>
        <Button
          title="Món đồ đang bán"
          secondary={tab !== "products"}
          onPress={() => setTab("products")}
        />
        <Button
          title="Đánh giá"
          secondary={tab !== "reviews"}
          onPress={() => setTab("reviews")}
        />
      </View>
      {tab === "products" ? (
        <>
          <Feedback
            loading={products.isPending}
            error={products.error}
            retry={() => {
              void products.refetch();
            }}
          />
          {products.data?.items.length === 0 && (
            <EmptyState title="Người bán chưa có món đồ nào" />
          )}
          {products.data && (
            <>
              <ProductGrid items={products.data.items} />
              <Pagination
                page={page}
                total={products.data.meta.total}
                pageSize={products.data.meta.page_size}
                onChange={setPage}
              />
            </>
          )}
        </>
      ) : (
        <>
          <Feedback
            loading={reviews.isPending}
            error={reviews.error}
            retry={() => {
              void reviews.refetch();
            }}
          />
          {reviews.data?.items.length === 0 && (
            <EmptyState
              title="Chưa có đánh giá"
              description="Đánh giá sẽ xuất hiện sau giao dịch hoàn tất."
            />
          )}
          {reviews.data?.items.map((review) => (
            <View key={review.id} style={styles.card}>
              <Text style={styles.label}>
                {review.reviewer.name} · {review.rating} / 5
              </Text>
              <Text style={styles.text}>
                {review.comment ?? "Không có nhận xét."}
              </Text>
              <Text style={styles.meta}>
                {formatDateTime(review.created_at)}
              </Text>
            </View>
          ))}
          {reviews.data && (
            <Pagination
              page={reviewPage}
              total={reviews.data.meta.total}
              onChange={setReviewPage}
            />
          )}
        </>
      )}
      <ReportSheet
        target={report ? { type: "user", id } : null}
        onClose={() => setReport(false)}
      />
    </Screen>
  );
}
