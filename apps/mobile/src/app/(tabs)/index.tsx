import type { ComponentProps } from "react";
import { Pressable, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { api } from "../../services/runtime";
import { useSession } from "../../services/session-context";
import {
  Button,
  colors,
  EmptyState,
  Feedback,
  ProductGrid,
  ProductGridSkeleton,
  Screen,
  styles,
} from "../../components/ui";
import {
  MarketplaceFooter,
  MarketplaceHeader,
} from "../../components/MarketplaceHeader";

const categoryIcons: Record<string, ComponentProps<typeof Ionicons>["name"]> = {
  "dien-tu": "desktop-outline",
  "thoi-trang": "shirt-outline",
  "noi-that": "bed-outline",
  "sach-van-phong": "book-outline",
  "xe-co": "car-outline",
  "gia-dung": "cafe-outline",
};
const steps = [
  {
    title: "Đăng tin",
    body: "Chụp ảnh, mô tả tình trạng món đồ và mức giá bạn muốn bán.",
  },
  {
    title: "Trao đổi",
    body: "Nhắn tin trực tiếp để thống nhất tình trạng, giá và cách giao nhận.",
  },
  {
    title: "Giao nhận",
    body: "Gặp trực tiếp hoặc giao hàng, trả tiền mặt khi nhận được món đồ.",
  },
];

export default function Home() {
  const router = useRouter();
  const { user } = useSession();
  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: api.categories.tree,
    staleTime: 5 * 60_000,
  });
  const latest = useQuery({
    queryKey: ["products", "home", user?.id],
    queryFn: () =>
      api.products.list({ sort: "newest", page_size: 10, page: 1 }),
  });
  const roots = (categories.data ?? [])
    .filter((item) => item.status === "ACTIVE")
    .slice(0, 6);
  return (
    <Screen
      header={<MarketplaceHeader />}
      onRefresh={() => {
        void categories.refetch();
        void latest.refetch();
      }}
      refreshing={latest.isRefetching || categories.isRefetching}
    >
      <View
        style={{
          backgroundColor: colors.soft,
          borderRadius: 16,
          paddingHorizontal: 24,
          paddingVertical: 32,
          gap: 12,
          marginTop: 8,
        }}
      >
        <Text
          style={[
            styles.label,
            {
              color: colors.green,
              textTransform: "uppercase",
              letterSpacing: 0.7,
            },
          ]}
        >
          Mua bán đồ đã qua sử dụng
        </Text>
        <Text
          style={{
            fontSize: 28,
            lineHeight: 35,
            fontWeight: "700",
            color: colors.text,
          }}
        >
          Món đồ cũ. Giá trị mới.
        </Text>
        <Text style={[styles.text, { color: colors.muted }]}>
          Tìm món bạn cần, nhường món bạn không còn dùng.
        </Text>
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 12,
            marginTop: 12,
          }}
        >
          <Button
            title="Khám phá sản phẩm"
            onPress={() => router.push("/products")}
          />
          <Button
            title="Đăng bán ngay"
            secondary
            onPress={() => router.push("/sell")}
          />
        </View>
      </View>
      <View style={{ gap: 20, paddingVertical: 16 }}>
        <Text style={styles.heading}>Khám phá theo danh mục</Text>
        {categories.isPending ? (
          <View
            accessibilityLabel="Đang tải danh mục"
            accessibilityState={{ busy: true }}
            style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}
          >
            {Array.from({ length: 6 }, (_, i) => (
              <View
                key={i}
                style={{
                  flexBasis: "30%",
                  flexGrow: 1,
                  height: 92,
                  borderRadius: 12,
                  backgroundColor: colors.subtle,
                }}
              />
            ))}
          </View>
        ) : (
          <Feedback
            error={categories.error}
            retry={() => {
              void categories.refetch();
            }}
          />
        )}
        {!categories.isPending && !categories.error && !roots.length && (
          <Text style={styles.muted}>Chưa có danh mục nào.</Text>
        )}
        {!!roots.length && (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
            {roots.map((item) => (
              <View
                key={item.id}
                style={{ width: "30%", flexGrow: 1, maxWidth: "33.333%" }}
              >
                <Pressable
                  accessibilityRole="link"
                  onPress={() =>
                    router.push({
                      pathname: "/products",
                      params: { category_id: item.id },
                    })
                  }
                  style={({ pressed }) => [
                    styles.card,
                    {
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                      paddingHorizontal: 8,
                      minHeight: 92,
                      height: "100%",
                      backgroundColor: pressed ? colors.soft : colors.card,
                    },
                  ]}
                >
                  <Ionicons
                    name={categoryIcons[item.slug] ?? "cube-outline"}
                    size={24}
                    color={colors.green}
                  />
                  <Text
                    style={[
                      styles.meta,
                      { color: colors.text, textAlign: "center" },
                    ]}
                  >
                    {item.name}
                  </Text>
                </Pressable>
              </View>
            ))}
            {Array.from({ length: (3 - (roots.length % 3)) % 3 }, (_, i) => (
              <View key={`space-${i}`} style={{ width: "30%", flexGrow: 1 }} />
            ))}
          </View>
        )}
      </View>
      <View style={{ gap: 20 }}>
        <View style={[styles.row, { justifyContent: "space-between", gap: 8 }]}>
          <Text style={styles.heading}>Mới đăng gần đây</Text>
          <Pressable
            accessibilityRole="link"
            onPress={() => router.push("/products")}
            style={{ minHeight: 44, justifyContent: "center" }}
          >
            <Text style={[styles.label, { color: colors.green }]}>
              Xem tất cả
            </Text>
          </Pressable>
        </View>
        {latest.isPending ? (
          <ProductGridSkeleton />
        ) : (
          <Feedback
            error={latest.error}
            retry={() => {
              void latest.refetch();
            }}
          />
        )}
        {latest.data && !latest.error && (
          <ProductGrid items={latest.data.items} />
        )}
        {latest.data?.items.length === 0 && (
          <EmptyState
            title="Chưa có tin đăng nào"
            description="Hãy là người đầu tiên đăng món đồ của bạn."
            action={
              <Button
                title="Đăng món đồ đầu tiên"
                onPress={() => router.push("/sell")}
              />
            }
          />
        )}
      </View>
      <View
        style={{
          gap: 20,
          marginTop: 16,
          paddingVertical: 32,
          borderTopWidth: 1,
          borderColor: colors.border,
        }}
      >
        <Text style={styles.heading}>Ba bước để trao đổi món đồ</Text>
        {steps.map((step, i) => (
          <View
            key={step.title}
            style={[styles.card, { padding: 20, backgroundColor: colors.bg }]}
          >
            <View
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: colors.soft,
              }}
            >
              <Text style={[styles.label, { color: colors.green }]}>
                {i + 1}
              </Text>
            </View>
            <Text
              style={{
                fontSize: 18,
                lineHeight: 28,
                fontWeight: "600",
                color: colors.text,
              }}
            >
              {step.title}
            </Text>
            <Text style={[styles.text, { color: colors.muted }]}>
              {step.body}
            </Text>
          </View>
        ))}
      </View>
      <MarketplaceFooter />
    </Screen>
  );
}
