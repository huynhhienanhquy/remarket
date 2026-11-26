import type { ComponentProps } from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { HoverPressable as Pressable } from "../../components/HoverPressable";
import { Image } from "expo-image";
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
  Screen,
  styles,
} from "../../components/ui";
import { ProductGrid, ProductGridSkeleton } from "../../components/ProductCards";
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
// Metro requires a static require for bundled image files.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const heroImage = require("../../../../../packages/shared/assets/marketplace-hero.jpg");

const steps: Array<{ title: string; body: string; icon: ComponentProps<typeof Ionicons>["name"] }> = [
  {
    title: "Đăng tin",
    icon: "camera-outline",
    body: "Chụp ảnh, mô tả tình trạng món đồ và mức giá bạn muốn bán.",
  },
  {
    title: "Trao đổi",
    icon: "chatbubble-outline",
    body: "Nhắn tin trực tiếp để thống nhất tình trạng, giá và cách giao nhận.",
  },
  {
    title: "Giao nhận",
    icon: "cart-outline",
    body: "Gặp trực tiếp hoặc giao hàng, trả tiền mặt khi nhận được món đồ.",
  },
];

export default function Home() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const wide = width >= 1024;
  const categoryWidth = wide ? "15%" : "30%";
  const categoryColumns = wide ? 6 : 3;
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
      <View style={[homeStyles.hero, wide && homeStyles.heroWide]}>
        <View style={[homeStyles.heroCopy, wide && homeStyles.heroCopyWide]}>
          <Text accessibilityRole="header" style={[homeStyles.heroTitle, wide && homeStyles.heroTitleWide]}>
            Món đồ cũ.{"\n"}
            <Text style={homeStyles.heroAccent}>Giá trị mới.</Text>
          </Text>
          <Text style={homeStyles.heroDescription}>
            Tìm mua món đồ đã qua sử dụng hoặc đăng bán những gì bạn không còn cần.
          </Text>
          <View style={homeStyles.heroActions}>
            <Pressable
              accessibilityRole="link"
              onPress={() => router.push("/products")}
              style={({ pressed }) => [homeStyles.heroButton, homeStyles.browseButton, pressed && homeStyles.pressed]}
            >
              <Text style={homeStyles.browseLabel}>Khám phá</Text>
              <Ionicons name="chevron-forward" size={16} color="#143d2d" />
            </Pressable>
            <Pressable
              accessibilityRole="link"
              onPress={() => router.push("/sell")}
              style={({ pressed }) => [homeStyles.heroButton, homeStyles.sellButton, pressed && homeStyles.pressed]}
            >
              <Ionicons name="add" size={18} color={colors.card} />
              <Text style={homeStyles.sellLabel}>Đăng bán</Text>
            </Pressable>
          </View>
        </View>
        <View style={[homeStyles.heroPhoto, wide && homeStyles.heroPhotoWide]}>
          <Image
            source={heroImage}
            accessible={false}
            contentFit="cover"
            contentPosition={{ top: "65%", left: "50%" }}
            style={StyleSheet.absoluteFill}
          />
        </View>
      </View>
      <View style={{ gap: 16, paddingTop: 16, paddingBottom: 12 }}>
        <Text style={styles.heading}>Danh mục sản phẩm</Text>
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
                  flexBasis: categoryWidth,
                  flexGrow: 1,
                  height: 96,
                  borderRadius: 16,
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
              <Pressable
                key={item.id}
                accessibilityRole="link"
                accessibilityLabel={item.name}
                onPress={() =>
                  router.push({
                    pathname: "/products",
                    params: { category_id: item.id },
                  })
                }
                style={({ pressed }) => [
                  styles.card,
                  {
                    flexBasis: categoryWidth,
                    flexGrow: 1,
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    paddingHorizontal: 8,
                    minHeight: 96,
                    borderRadius: 16,
                    paddingVertical: 12,
                    backgroundColor: pressed ? colors.soft : colors.card,
                  },
                ]}
              >
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 12,
                    backgroundColor: colors.soft,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Ionicons
                    name={categoryIcons[item.slug] ?? "cube-outline"}
                    size={20}
                    color={colors.green}
                  />
                </View>
                <Text
                  style={[
                    styles.meta,
                    { color: colors.text, textAlign: "center", fontWeight: "600" },
                  ]}
                >
                  {item.name}
                </Text>
              </Pressable>
            ))}
            {Array.from({ length: (categoryColumns - (roots.length % categoryColumns)) % categoryColumns }, (_, i) => (
              <View key={`space-${i}`} style={{ flexBasis: categoryWidth, flexGrow: 1 }} />
            ))}
          </View>
        )}
      </View>
      <View style={{ gap: 12 }}>
        <View style={[styles.row, { justifyContent: "space-between", gap: 8 }]}>
          <Text style={[styles.heading, { flexShrink: 1 }]}>Mới đăng gần đây</Text>
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
          <ProductGridSkeleton count={10} />
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
        {steps.map((step) => (
          <View
            key={step.title}
            style={[styles.card, { padding: 20, borderRadius: 16 }]}
          >
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: colors.soft,
              }}
            >
              <Ionicons name={step.icon} size={20} color={colors.green} />
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

const homeStyles = StyleSheet.create({
  hero: {
    backgroundColor: "#143d2d",
    borderRadius: 24,
    overflow: "hidden",
  },
  heroWide: { flexDirection: "row" },
  heroCopy: { gap: 12, paddingHorizontal: 20, paddingVertical: 28 },
  heroCopyWide: { flex: 1.1, padding: 40, justifyContent: "center" },
  heroTitle: { color: "#ffffff", fontSize: 34, lineHeight: 39, fontWeight: "700", letterSpacing: -1 },
  heroTitleWide: { fontSize: 54, lineHeight: 60, letterSpacing: -2 },
  heroAccent: { color: "#cce6a7" },
  heroDescription: { color: "#e2eee4", fontSize: 14, lineHeight: 22, maxWidth: 360 },
  heroActions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 },
  heroButton: {
    minHeight: 44,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  browseButton: { backgroundColor: "#cce6a7" },
  browseLabel: { color: "#143d2d", fontSize: 14, fontWeight: "700" },
  sellButton: { borderWidth: 1, borderColor: "#8b9e91" },
  sellLabel: { color: "#ffffff", fontSize: 14, fontWeight: "700" },
  pressed: { opacity: 0.8 },
  heroPhoto: { height: 124, backgroundColor: "#7e8051" },
  heroPhotoWide: { flex: 0.9, height: "auto" },
});
