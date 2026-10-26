import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { MarketplaceImage } from "../../components/MarketplaceImage";
import { Stack, useRouter, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import {
  formatVnd,
  formatRelative,
  ORDER_STATUSES,
  ORDER_STATUS_LABELS,
} from "@remarket/shared";
import { SelectField } from "../../components/SelectField";
import { api } from "../../services/runtime";
import { useSession } from "../../services/session-context";
import {
  Screen,
  Button,
  Feedback,
  LoginPrompt,
  Pagination,
  EmptyState,
  StatusBadge,
  styles,
  colors,
} from "../../components/ui";
export default function Orders() {
  const router = useRouter();
  const params = useLocalSearchParams<{ role?: string }>();
  const { user } = useSession();
  const role = params.role === "seller" ? "seller" : "buyer";
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  useEffect(() => {
    setStatus("");
    setPage(1);
  }, [role, user?.id]);
  const result = useQuery({
    queryKey: ["orders", user?.id, role, page, status],
    queryFn: () => api.orders.list({ role, page, status: status || undefined }),
    enabled: !!user,
  });
  return (
    <Screen
      title={role === "buyer" ? "Đơn mua" : "Đơn bán"}
      titleCard
      description={
        role === "buyer"
          ? "Theo dõi các món đồ bạn đã đặt mua."
          : "Quản lý đơn hàng và giao nhận với người mua."
      }
    >
      <Stack.Screen
        options={{ title: role === "buyer" ? "Đơn mua" : "Đơn bán" }}
      />
      {!user ? (
        <LoginPrompt />
      ) : (
        <>
          <View style={styles.row}>
            <Button
              title="Đơn mua"
              secondary={role !== "buyer"}
              onPress={() => {
                router.setParams({ role: "buyer" });
                setStatus("");
                setPage(1);
              }}
            />
            <Button
              title="Đơn bán"
              secondary={role !== "seller"}
              onPress={() => {
                router.setParams({ role: "seller" });
                setStatus("");
                setPage(1);
              }}
            />
          </View>
          <SelectField
            label="Trạng thái đơn"
            value={status}
            items={[
              { value: "", label: "Tất cả" },
              ...ORDER_STATUSES.map((value) => ({
                value,
                label: ORDER_STATUS_LABELS[value].label,
              })),
            ]}
            onChange={(value) => {
              setStatus(value);
              setPage(1);
            }}
          />
          <Feedback
            loading={result.isPending}
            error={result.error}
            retry={() => {
              void result.refetch();
            }}
          />
          {result.data?.items.map((order) => (
            <Pressable
              key={order.id}
              accessibilityRole="link"
              accessibilityLabel={`Xem đơn ${order.code}`}
              onPress={() => router.push(`/orders/${order.id}`)}
              style={[styles.card, { borderRadius: 16, padding: 20, gap: 16 }]}
            >
              <View style={[styles.row, { flexWrap: "nowrap" }]}>
                <View
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    backgroundColor: colors.soft,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Ionicons
                    name="receipt-outline"
                    size={20}
                    color={colors.green}
                  />
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={[styles.label, { fontWeight: "600" }]}>
                    {role === "buyer" ? "Đơn mua" : "Đơn bán"} #
                    {order.code.slice(0, 8).toUpperCase()}
                  </Text>
                  <Text numberOfLines={1} style={styles.muted}>
                    {role === "buyer" ? "Người bán" : "Người mua"}:{" "}
                    {order.counterparty.name}
                  </Text>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={20}
                  color={colors.muted}
                />
              </View>
              <View
                style={[
                  styles.row,
                  {
                    borderTopWidth: 1,
                    borderColor: colors.border,
                    paddingTop: 16,
                    gap: 12,
                  },
                ]}
              >
                {order.items.length > 0 && (
                  <View style={styles.row}>
                    {order.items.slice(0, 3).map((item) => (
                      <MarketplaceImage
                        key={item.id}
                        uri={item.image_url ?? ""}
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: 8,
                          backgroundColor: colors.subtle,
                        }}
                      />
                    ))}
                  </View>
                )}
                <View style={{ gap: 4 }}>
                  <Text
                    style={[
                      styles.heading,
                      { fontSize: 18, color: colors.green },
                    ]}
                  >
                    {formatVnd(order.total_amount)}
                  </Text>
                  <Text style={styles.meta}>
                    {order.delivery_method === "COD"
                      ? "Giao hàng COD"
                      : "Gặp trực tiếp"}
                  </Text>
                </View>
                <StatusBadge {...ORDER_STATUS_LABELS[order.status]} />
                <Text style={styles.meta}>
                  {formatRelative(order.created_at)}
                </Text>
              </View>
            </Pressable>
          ))}
          {result.data?.items.length === 0 && (
            <EmptyState
              icon="receipt-outline"
              title={
                status
                  ? "Không có đơn hàng ở trạng thái này"
                  : role === "buyer"
                    ? "Bạn chưa có đơn mua"
                    : "Bạn chưa có đơn bán"
              }
              description={
                status
                  ? "Thử chọn một trạng thái khác để xem đơn hàng của bạn."
                  : role === "buyer"
                    ? "Khám phá món đồ phù hợp và đặt đơn hàng đầu tiên của bạn."
                    : "Đơn hàng xuất hiện khi có người mua món đồ của bạn."
              }
              action={
                !status ? (
                  <Button
                    title={
                      role === "buyer" ? "Khám phá sản phẩm" : "Xem tin đăng"
                    }
                    onPress={() =>
                      router.navigate(
                        role === "buyer" ? "/products" : "/my-products",
                      )
                    }
                  />
                ) : undefined
              }
            />
          )}
          {result.data && (
            <Pagination
              page={page}
              total={result.data.meta.total}
              pageSize={result.data.meta.page_size}
              onChange={setPage}
            />
          )}
        </>
      )}
    </Screen>
  );
}
