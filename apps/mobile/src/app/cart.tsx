import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { HoverPressable as Pressable } from "../components/HoverPressable";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { useMutation, useQuery } from "@tanstack/react-query";
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

const ratingFormat = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 });

export default function Cart() {
  const router = useRouter();
  const { user } = useSession();
  const network = useNetInfo();
  const online = network.isConnected !== false;
  const action = useAction();
  const [excluded, setExcluded] = useState<string[]>([]);
  useEffect(() => setExcluded([]), [user?.id]);
  const cart = useQuery({
    queryKey: ["cart", user?.id],
    queryFn: api.cart.get,
    enabled: !!user,
  });
  const chat = useMutation({
    mutationFn: (productId: string) => api.chat.open(productId),
    onSuccess: (conversation) => router.push(`/messages/${conversation.id}`),
  });
  const groups = cart.data?.groups ?? [];
  const availableItems = groups.flatMap((group) =>
    group.items.filter((item) => item.available && !item.unavailable_reason),
  );
  const selected = availableItems.filter((item) => !excluded.includes(item.product_id));
  const selectedIds = selected.map((item) => item.product_id);
  const subtotal = addVnd(...selected.map((item) => item.price));
  const allSelected = availableItems.length > 0 && selectedIds.length === availableItems.length;
  const partialSelection = selectedIds.length > 0 && !allSelected;
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
              title={selectedIds.length > 0 ? `Tiến hành đặt hàng (${selectedIds.length})` : "Chọn món đồ để tiếp tục"}
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
            error={cart.error ?? action.error ?? chat.error}
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
          {groups.length > 0 && (
            <Pressable
              accessibilityRole="checkbox"
              accessibilityLabel="Chọn tất cả"
              accessibilityState={{ checked: partialSelection ? "mixed" : allSelected, disabled: availableItems.length === 0 || action.pending }}
              disabled={availableItems.length === 0 || action.pending}
              onPress={() => setExcluded(allSelected ? availableItems.map((item) => item.product_id) : [])}
              style={[styles.card, cartStyles.selectAll]}
            >
              <Ionicons name={allSelected ? "checkbox" : partialSelection ? "remove-circle-outline" : "square-outline"} size={22} color={selectedIds.length > 0 ? colors.green : colors.muted} />
              <Text style={styles.label}>Chọn tất cả</Text>
            </Pressable>
          )}
          {groups.map((group) => (
            <View key={group.seller.id} style={[styles.card, cartStyles.sellerCard]}>
              <Pressable
                accessibilityRole="link"
                onPress={() => router.push(`/users/${group.seller.id}`)}
                style={cartStyles.sellerHeader}
              >
                {group.seller.avatar_url ? (
                  <MarketplaceImage uri={group.seller.avatar_url} style={cartStyles.avatar} />
                ) : (
                  <View style={cartStyles.avatar}>
                    <Text style={cartStyles.initials}>
                      {group.seller.name.trim().split(/\s+/).slice(-2).map((name) => name.charAt(0).toUpperCase()).join("")}
                    </Text>
                  </View>
                )}
                <View style={cartStyles.sellerInfo}>
                  <Text style={styles.meta}>Người bán</Text>
                  <Text style={cartStyles.sellerName}>{group.seller.name}</Text>
                  {group.seller.rating !== null && (
                    <View style={cartStyles.rating}>
                      <Ionicons name="star" size={12} color="#b86b04" />
                      <Text style={styles.meta}>{ratingFormat.format(group.seller.rating)}/5</Text>
                    </View>
                  )}
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.muted} />
              </Pressable>

              {group.items.map((item, index) => {
                const checked = selectedIds.includes(item.product_id);
                const unavailable = !item.available || !!item.unavailable_reason;
                const condition = CONDITION_LABELS[item.condition];
                const canChat = online && !!user.email_verified_at && user.status === "ACTIVE"
                  && user.id !== group.seller.id && !unavailable && !chat.isPending && !action.pending;
                return (
                  <View key={item.product_id} style={index > 0 && cartStyles.divider}>
                    <Pressable
                      accessibilityRole="link"
                      accessibilityLabel={`Xem ${item.title}`}
                      onPress={() => router.push(`/products/${item.product_id}`)}
                      style={cartStyles.item}
                    >
                      <View style={cartStyles.thumbnail}>
                        {item.image_url ? (
                          <MarketplaceImage uri={item.image_url} style={cartStyles.photo} />
                        ) : (
                          <Ionicons name="image-outline" size={22} color={colors.muted} />
                        )}
                        <Text style={cartStyles.imageCondition}>{condition}</Text>
                      </View>
                      <View style={cartStyles.itemInfo}>
                        <Text style={cartStyles.itemTitle}>{item.title}</Text>
                        <View style={cartStyles.metadata}>
                          <View style={cartStyles.location}>
                            <Ionicons name="location-outline" size={13} color={colors.muted} />
                            <Text style={[styles.meta, cartStyles.locationText]}>{item.province_label ?? "Chưa cập nhật khu vực"}</Text>
                          </View>
                          <Text style={[styles.meta, cartStyles.condition]}>{condition}</Text>
                        </View>
                        <Text style={cartStyles.price}>{formatVnd(item.price)}</Text>
                        {unavailable && <Text style={styles.error}>{item.unavailable_reason ?? "Món đồ không còn khả dụng."}</Text>}
                      </View>
                    </Pressable>
                    <View style={cartStyles.actions}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Xóa ${item.title} khỏi giỏ hàng`}
                        hover="danger"
                        disabled={!online || action.pending}
                        onPress={() => {
                          void action.run(async () => {
                            await api.cart.remove(item.product_id);
                            await Promise.all([
                              queryClient.invalidateQueries({ queryKey: ["cart"] }),
                              queryClient.invalidateQueries({ queryKey: ["notifications", "navigation-counts"] }),
                            ]);
                            setExcluded((ids) => ids.filter((id) => id !== item.product_id));
                          });
                        }}
                        style={[cartStyles.remove, (!online || action.pending) && cartStyles.disabled]}
                      >
                        <Ionicons name="trash-outline" size={16} color={colors.red} />
                        <Text style={cartStyles.removeText}>Xóa</Text>
                      </Pressable>
                      <Pressable
                        accessibilityRole="checkbox"
                        accessibilityLabel={`Chọn ${item.title}`}
                        accessibilityState={{ checked, disabled: unavailable || action.pending }}
                        disabled={unavailable || action.pending}
                        onPress={() =>
                          setExcluded((ids) =>
                            ids.includes(item.product_id)
                              ? ids.filter((id) => id !== item.product_id)
                              : [...ids, item.product_id],
                          )
                        }
                        style={[cartStyles.selection, (unavailable || action.pending) && cartStyles.disabled]}
                      >
                        <Ionicons name={checked ? "checkbox" : "square-outline"} size={22} color={checked ? colors.green : colors.muted} />
                        <Text style={styles.label}>Chọn</Text>
                      </Pressable>
                      <Button
                        title="Nhắn tin"
                        icon="chatbubble-outline"
                        secondary
                        compact
                        disabled={!canChat}
                        loading={chat.isPending && chat.variables === item.product_id}
                        onPress={() => chat.mutate(item.product_id)}
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

const cartStyles = StyleSheet.create({
  selectAll: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10 },
  sellerCard: { borderRadius: 0, padding: 0, overflow: "hidden", gap: 0 },
  sellerHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: colors.green,
    alignItems: "center",
    justifyContent: "center",
  },
  initials: { fontSize: 14, fontWeight: "700", color: colors.card },
  sellerInfo: { flex: 1, minWidth: 0 },
  sellerName: { fontSize: 14, fontWeight: "700", color: colors.text },
  rating: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  divider: { borderTopWidth: 1, borderColor: colors.border },
  item: { flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 14 },
  thumbnail: {
    width: 84,
    height: 84,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  photo: { width: "100%", height: "100%" },
  imageCondition: {
    position: "absolute",
    top: 4,
    left: 4,
    maxWidth: 74,
    borderRadius: 5,
    paddingHorizontal: 5,
    paddingVertical: 2,
    backgroundColor: colors.green,
    color: colors.card,
    fontSize: 10,
    fontWeight: "700",
  },
  itemInfo: { flex: 1, minWidth: 0, gap: 4 },
  itemTitle: { fontSize: 14, lineHeight: 20, fontWeight: "600", color: colors.text },
  metadata: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 },
  location: { flexDirection: "row", alignItems: "center", gap: 3, flexShrink: 1 },
  locationText: { flexShrink: 1 },
  condition: { borderRadius: 12, paddingHorizontal: 7, backgroundColor: colors.subtle },
  price: { fontSize: 18, lineHeight: 24, fontWeight: "700", color: colors.green },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
  },
  remove: { minHeight: 44, flexDirection: "row", alignItems: "center", paddingHorizontal: 5, gap: 5 },
  removeText: { fontSize: 14, fontWeight: "600", color: colors.red },
  selection: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 4 },
  disabled: { opacity: 0.5 },
});
