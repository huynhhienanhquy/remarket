import { useState } from "react";
import { Text, View, Alert } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import {
  formatVnd,
  formatDate,
  CONDITION_LABELS,
  PRODUCT_STATUS_LABELS,
} from "@remarket/shared";
import { api, http } from "../../services/runtime";
import { useSession, queryClient } from "../../services/session-context";
import {
  Screen,
  Button,
  Feedback,
  IconButton,
  MenuRow,
  useAction,
  styles,
  colors,
} from "../../components/ui";
import { ProductGallery } from "../../components/ProductGallery";
import { ReportSheet } from "../../components/ReportSheet";
import { deliveryLabel } from "../../services/marketplace";

export default function ProductDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useSession();
  const action = useAction();
  const [report, setReport] = useState(false);
  const result = useQuery({
    queryKey: ["products", id, user?.id],
    queryFn: () => api.products.detail(id),
    enabled: !!id,
  });
  const product = result.error ? undefined : result.data;
  const authenticated = (task: () => Promise<unknown>) => {
    if (!user)
      router.push({
        pathname: "/login",
        params: { returnTo: `/products/${id}` },
      });
    else void action.run(task);
  };
  return (
    <Screen
      onRefresh={() => {
        void result.refetch();
      }}
      refreshing={result.isRefetching}
      footer={
        product && !product.capabilities.can_manage ? (
          <View style={[styles.row, { flexWrap: "nowrap" }]}>
            <IconButton
              icon="cart-outline"
              label="Thêm vào giỏ"
              disabled={
                action.pending ||
                (!!user && !product.capabilities.can_add_to_cart)
              }
              onPress={() =>
                authenticated(async () => {
                  const cart = await api.cart.add(id);
                  queryClient.setQueryData(["cart", user!.id], cart);
                  router.push("/cart");
                })
              }
            />
            <View style={{ flex: 1 }}>
              <Button
                title="Nhắn tin"
                secondary
                disabled={
                  action.pending || (!!user && !product.capabilities.can_chat)
                }
                onPress={() =>
                  authenticated(async () => {
                    const conversation = await api.chat.open(id);
                    router.push(`/messages/${conversation.id}`);
                  })
                }
              />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                title="Mua ngay"
                loading={action.pending}
                disabled={!!user && !product.capabilities.can_buy}
                onPress={() =>
                  authenticated(async () => {
                    router.push({
                      pathname: "/checkout",
                      params: { product_id: id },
                    });
                  })
                }
              />
            </View>
          </View>
        ) : undefined
      }
    >
      <Feedback
        loading={result.isPending}
        error={result.error}
        retry={() => {
          void result.refetch();
        }}
      />
      {product && (
        <>
          <ProductGallery images={product.images} title={product.title} />
          <Text style={styles.meta}>{product.category_path.join(" / ")}</Text>
          <Text style={styles.title}>{product.title}</Text>
          <Text style={[styles.title, { fontSize: 28, lineHeight: 36 }]}>
            {formatVnd(product.price)}
          </Text>
          <Text style={styles.muted}>
            {PRODUCT_STATUS_LABELS[product.status].label} ·{" "}
            {product.province_label}
          </Text>
          {product.capabilities.unavailable_reason && (
            <View style={[styles.card, { backgroundColor: colors.warningBg }]}>
              <Text style={styles.text}>
                {product.capabilities.unavailable_reason}
              </Text>
            </View>
          )}
          <View style={styles.card}>
            <Text style={styles.heading}>Thông tin món đồ</Text>
            <Text style={styles.text}>
              Tình trạng: {CONDITION_LABELS[product.condition]}
            </Text>
            {product.usage_months !== null && (
              <Text style={styles.text}>
                Đã sử dụng: {product.usage_months} tháng
              </Text>
            )}
            <Text style={styles.text}>
              {deliveryLabel(product.delivery_method)}
            </Text>
            {product.delivery_method !== "MEETUP" && (
              <Text style={styles.text}>
                Phí giao hàng: {formatVnd(product.shipping_fee)}
              </Text>
            )}
            {product.published_at && (
              <Text style={styles.meta}>
                Đăng ngày {formatDate(product.published_at)}
              </Text>
            )}
          </View>
          <View style={styles.card}>
            <Text style={styles.heading}>Mô tả</Text>
            <Text style={styles.text}>{product.description}</Text>
          </View>
          <View style={styles.card}>
            <MenuRow
              title={product.seller.name}
              description={product.seller.province_label ?? "Hồ sơ người bán"}
              icon="person-circle-outline"
              onPress={() => router.push(`/users/${product.seller.id}`)}
            />
            <Text style={styles.muted}>
              {product.seller.rating === null
                ? "Chưa có đánh giá"
                : `${product.seller.rating.toFixed(1)} / 5 · ${product.seller.review_count} đánh giá`}
            </Text>
            <Text style={styles.meta}>
              {product.seller.completed_sales_count} giao dịch hoàn tất · Tham
              gia {formatDate(product.seller.joined_at)}
            </Text>
          </View>
          {product.capabilities.can_manage && (
            <View style={styles.card}>
              <Text style={styles.heading}>Đây là tin đăng của bạn</Text>
              {product.capabilities.can_edit && (
                <Button
                  title="Chỉnh sửa tin"
                  onPress={() => router.push(`/edit-product/${id}`)}
                />
              )}
              <Button
                title="Quản lý tin đăng"
                secondary
                onPress={() => router.push("/my-products")}
              />
            </View>
          )}
          <Button
            title={product.is_favorited ? "Bỏ yêu thích" : "Lưu yêu thích"}
            secondary
            disabled={
              action.pending || (!!user && !product.capabilities.can_favorite)
            }
            onPress={() =>
              authenticated(async () => {
                await api.favorites.set(id, !product.is_favorited);
                await queryClient.invalidateQueries();
              })
            }
          />
          {user && product.capabilities.can_report && (
            <Button
              title="Báo cáo tin đăng"
              secondary
              onPress={() => setReport(true)}
            />
          )}
          {user && user.id !== product.seller.id && (
            <Button
              title="Chặn người bán"
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
                          await http.put(`/mobile/blocks/${product.seller.id}`);
                          await queryClient.invalidateQueries();
                        }, "Đã chặn người dùng.");
                      },
                    },
                  ],
                )
              }
            />
          )}
        </>
      )}
      <Feedback error={action.error} />
      <ReportSheet
        target={report ? { type: "product", id } : null}
        onClose={() => setReport(false)}
      />
    </Screen>
  );
}
