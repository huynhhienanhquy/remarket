import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useNetInfo } from "@react-native-community/netinfo";
import { addVnd, CONDITION_LABELS, formatVnd } from "@remarket/shared";
import { api } from "../services/runtime";
import { queryClient, useSession } from "../services/session-context";
import { MarketplaceImage } from "../components/MarketplaceImage";
import {
  Button,
  colors,
  EmptyState,
  Feedback,
  LoginPrompt,
  Screen,
  styles,
  useAction,
} from "../components/ui";

export default function Cart() {
  const router = useRouter();
  const { user } = useSession();
  const network = useNetInfo();
  const online =
    network.isConnected !== false && network.isInternetReachable !== false;
  const action = useAction();
  const [excluded, setExcluded] = useState<string[]>([]);
  useEffect(() => setExcluded([]), [user?.id]);
  const cart = useQuery({
    queryKey: ["cart", user?.id],
    queryFn: api.cart.get,
    enabled: !!user,
  });
  const groups = cart.data?.groups ?? [];
  const selected = groups.flatMap((group) =>
    group.items.filter(
      (item) =>
        item.available &&
        !item.unavailable_reason &&
        !excluded.includes(item.product_id),
    ),
  );
  const selectedIds = selected.map((item) => item.product_id);
  const subtotal = addVnd(...selected.map((item) => item.price));
  return (
    <Screen
      title="Giỏ hàng"
      titleCard
      description="Xem lại những món đồ bạn muốn mua trước khi đặt hàng."
      onRefresh={
        user
          ? () => {
              void cart.refetch();
            }
          : undefined
      }
      refreshing={cart.isRefetching}
      footer={
        user && groups.length > 0 ? (
          <View style={{ gap: 8 }}>
            <View style={[styles.row, { justifyContent: "space-between" }]}>
              <Text style={styles.label}>
                Tạm tính ({selectedIds.length} món)
              </Text>
              <Text style={styles.heading}>{formatVnd(subtotal)}</Text>
            </View>
            <Text style={styles.meta}>
              Phí giao hàng được tính theo từng người bán ở bước đặt hàng.
            </Text>
            <Button
              title={`Tiến hành đặt hàng (${selectedIds.length})`}
              disabled={
                !online ||
                action.pending ||
                selectedIds.length === 0 ||
                selectedIds.length > 50 ||
                !!cart.error
              }
              onPress={() =>
                router.push({
                  pathname: "/checkout",
                  params: { items: selectedIds.join(",") },
                })
              }
            />
          </View>
        ) : undefined
      }
    >
      {!user ? (
        <LoginPrompt />
      ) : (
        <>
          <Feedback
            loading={cart.isPending}
            error={cart.error ?? action.error}
            retry={() => {
              void cart.refetch();
            }}
          />
          {cart.data &&
            cart.data.total_items >
              groups.reduce((sum, group) => sum + group.items.length, 0) && (
              <Text style={styles.muted}>
                Đang hiển thị 50 món đầu tiên. Xóa hoặc đặt các món hiện tại để
                xem những món còn lại.
              </Text>
            )}
          {cart.data?.total_items === 0 && (
            <EmptyState
              icon="cart-outline"
              title="Giỏ hàng trống"
              description="Bạn chưa thêm món đồ nào vào giỏ hàng."
              action={
                <Button
                  title="Khám phá sản phẩm"
                  onPress={() => router.navigate("/products")}
                />
              }
            />
          )}
          {groups.map((group) => (
            <View
              key={group.seller.id}
              style={[
                styles.card,
                { borderRadius: 16, padding: 0, overflow: "hidden", gap: 0 },
              ]}
            >
              <Pressable
                accessibilityRole="link"
                onPress={() => router.push(`/users/${group.seller.id}`)}
                style={[
                  styles.row,
                  {
                    padding: 16,
                    flexWrap: "nowrap",
                    borderBottomWidth: 1,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Ionicons
                  name="person-outline"
                  size={24}
                  color={colors.green}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.meta}>Người bán</Text>
                  <Text style={[styles.label, { fontWeight: "600" }]}>
                    {group.seller.name}
                  </Text>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={colors.muted}
                />
              </Pressable>
              {group.items.map((item, index) => {
                const checked = selectedIds.includes(item.product_id);
                const unavailable =
                  !item.available || !!item.unavailable_reason;
                return (
                  <View
                    key={item.product_id}
                    style={{
                      padding: 16,
                      gap: 12,
                      borderTopWidth: index ? 1 : 0,
                      borderColor: colors.border,
                    }}
                  >
                    <Pressable
                      accessibilityRole="link"
                      accessibilityLabel={`Xem ${item.title}`}
                      onPress={() =>
                        router.push(`/products/${item.product_id}`)
                      }
                      style={{ flexDirection: "row", gap: 12 }}
                    >
                      {item.image_url ? (
                        <MarketplaceImage
                          uri={item.image_url}
                          style={{ width: 80, height: 80, borderRadius: 8 }}
                        />
                      ) : (
                        <View
                          style={{
                            width: 80,
                            height: 80,
                            borderRadius: 8,
                            backgroundColor: colors.subtle,
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <Ionicons
                            name="image-outline"
                            size={24}
                            color={colors.muted}
                          />
                        </View>
                      )}
                      <View style={{ flex: 1, gap: 4 }}>
                        <Text numberOfLines={2} style={styles.label}>
                          {item.title}
                        </Text>
                        <Text
                          style={[
                            styles.label,
                            { color: colors.green, fontWeight: "700" },
                          ]}
                        >
                          {formatVnd(item.price)}
                        </Text>
                        <Text style={styles.meta}>
                          {item.province_label ?? "Chưa cập nhật khu vực"} ·{" "}
                          {CONDITION_LABELS[item.condition]}
                        </Text>
                      </View>
                    </Pressable>
                    {unavailable && (
                      <Text style={styles.error}>
                        {item.unavailable_reason ??
                          "Món đồ không còn khả dụng."}
                      </Text>
                    )}
                    <View
                      style={[styles.row, { justifyContent: "space-between" }]}
                    >
                      <Pressable
                        accessibilityRole="checkbox"
                        accessibilityLabel={`Chọn ${item.title}`}
                        accessibilityState={{
                          checked,
                          disabled: unavailable || action.pending,
                        }}
                        disabled={unavailable || action.pending}
                        onPress={() =>
                          setExcluded((ids) =>
                            checked
                              ? [...ids, item.product_id]
                              : ids.filter((id) => id !== item.product_id),
                          )
                        }
                        style={[
                          styles.row,
                          { minHeight: 44, opacity: unavailable ? 0.5 : 1 },
                        ]}
                      >
                        <Ionicons
                          name={checked ? "checkbox" : "square-outline"}
                          size={24}
                          color={checked ? colors.green : colors.muted}
                        />
                        <Text style={styles.label}>
                          {checked ? "Đã chọn" : "Chọn"}
                        </Text>
                      </Pressable>
                      <Button
                        title="Xóa"
                        ghost
                        disabled={!online || action.pending}
                        onPress={() => {
                          void action.run(async () => {
                            await api.cart.remove(item.product_id);
                            await Promise.all([
                              queryClient.invalidateQueries({
                                queryKey: ["cart"],
                              }),
                              queryClient.invalidateQueries({
                                queryKey: [
                                  "notifications",
                                  "navigation-counts",
                                ],
                              }),
                            ]);
                          });
                        }}
                      />
                    </View>
                  </View>
                );
              })}
            </View>
          ))}
        </>
      )}
    </Screen>
  );
}
