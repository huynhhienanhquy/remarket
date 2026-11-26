import type { ReactNode } from "react";
import { Children, memo, useState } from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { HoverPressable as Pressable } from "./HoverPressable";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import type { ProductListItem } from "@remarket/shared";
import { CONDITION_LABELS, PRODUCT_STATUS_LABELS, formatRelative, formatVnd } from "@remarket/shared";
import { api } from "../services/runtime";
import { queryClient, useSession } from "../services/session-context";
import { MarketplaceImage } from "./MarketplaceImage";
import { colors, Feedback, IconButton, layout, styles, useAction } from "./ui";

const cardStyles = StyleSheet.create({
  frame: { padding: 0, gap: 0, overflow: "hidden", borderRadius: 0 },
  image: { aspectRatio: 4 / 3, backgroundColor: colors.subtle },
});

export function ProductCard({ product }: { product: ProductListItem }) {
  const router = useRouter();
  const { user } = useSession();
  const favorite = useAction();
  const unavailable = product.is_hidden || product.is_blocked;
  const overlay = product.status === "RESERVED" || product.status === "SOLD";
  return (
    <Pressable
      hover="product"
      hoverDisabled={unavailable}
      accessibilityRole="button"
      accessibilityLabel={
        unavailable ? "Tin đăng không còn khả dụng" : product.title
      }
      onPress={() => {
        if (!unavailable) router.push(`/products/${product.id}`);
      }}
      style={({ pressed }) => [
        styles.card,
        cardStyles.frame,
        { flexGrow: 1 },
        pressed && !unavailable && { borderColor: colors.green },
      ]}
    >
      <View style={cardStyles.image}>
        {product.image_url && !unavailable ? (
          <MarketplaceImage
            uri={product.image_url}
            style={{ height: "100%", width: "100%" }}
            contentFit="cover"
            accessibilityLabel={product.title}
          />
        ) : (
          <View
            style={{
              flex: 1,
              backgroundColor: colors.subtle,
              gap: 8,
              padding: 12,
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <Ionicons name="image-outline" size={28} color={colors.muted} />
            {unavailable && (
              <Text style={[styles.meta, { textAlign: "center" }]}>
                Tin đăng không còn khả dụng
              </Text>
            )}
          </View>
        )}
        {overlay && !unavailable && (
          <View
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              bottom: 0,
              left: 0,
              padding: 8,
              alignItems: "flex-start",
              justifyContent: "flex-end",
              backgroundColor: `${colors.text}1A`,
            }}
          >
            <View
              style={{
                backgroundColor:
                  product.status === "RESERVED" ? colors.infoBg : colors.subtle,
                paddingHorizontal: 8,
                paddingVertical: 4,
                borderRadius: 8,
              }}
            >
              <Text
                style={[
                  styles.meta,
                  {
                    color:
                      product.status === "RESERVED" ? colors.info : colors.text,
                  },
                ]}
              >
                {PRODUCT_STATUS_LABELS[product.status].label}
              </Text>
            </View>
          </View>
        )}
        {(!unavailable || product.is_favorited) && (
          <View style={{ position: "absolute", top: 8, right: 8 }}>
            <IconButton
              icon={product.is_favorited ? "heart" : "heart-outline"}
              label={product.is_favorited ? "Bỏ yêu thích" : "Lưu yêu thích"}
              disabled={favorite.pending}
              round
              color={product.is_favorited ? colors.red : colors.text}
              onPress={() => {
                if (!user) {
                  router.push({
                    pathname: "/login",
                    params: { returnTo: `/products/${product.id}` },
                  });
                  return;
                }
                void favorite.run(async () => {
                  await api.favorites.set(product.id, !product.is_favorited);
                  await Promise.all([
                    queryClient.invalidateQueries({ queryKey: ["products"] }),
                    queryClient.invalidateQueries({ queryKey: ["favorites"] }),
                    queryClient.invalidateQueries({ queryKey: ["ai", "products"] }),
                  ]);
                });
              }}
            />
          </View>
        )}
      </View>
      {!unavailable && (
        <View style={{ padding: 12, gap: 4, flex: 1 }}>
          <Text numberOfLines={2} style={[styles.label, { minHeight: 40, fontWeight: "600" }]}>
            {product.title}
          </Text>
          <Text style={[styles.text, { fontWeight: "700", color: colors.green }]}>
            {formatVnd(product.price)}
          </Text>
          <View style={{ alignSelf: "flex-start", backgroundColor: colors.subtle, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
            <Text style={styles.meta}>{CONDITION_LABELS[product.condition]}</Text>
          </View>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              flexWrap: "wrap",
              columnGap: 8,
              paddingTop: 6,
            }}
          >
            <Text numberOfLines={1} style={[styles.meta, { flexShrink: 1, maxWidth: "100%" }]}>
              {product.province_label}
            </Text>
            <Text style={styles.meta}>
              {formatRelative(product.published_at ?? product.created_at)}
            </Text>
          </View>
          <Feedback error={favorite.error} />
        </View>
      )}
      {unavailable && <Feedback error={favorite.error} />}
    </Pressable>
  );
}

function ProductGridLayout({ children, loading }: { children: ReactNode; loading?: boolean }) {
  const { width } = useWindowDimensions();
  const [containerWidth, setContainerWidth] = useState(0);
  const padding = width >= 1024 ? 32 : width >= 640 ? 24 : 16;
  const available = containerWidth || Math.min(width, layout.maxWidth) - padding * 2;
  const columns = available >= 1216 ? 5 : available >= 960 ? 4 : available >= 592 ? 3 : 2;
  const gap = width >= 640 ? 20 : 12;
  const cardWidth = Math.floor((available - gap * (columns - 1)) / columns);
  return (
    <View
      accessibilityLabel={loading ? "Đang tải sản phẩm" : undefined}
      accessibilityState={loading ? { busy: true } : undefined}
      onLayout={(event) => setContainerWidth(event.nativeEvent.layout.width)}
      style={{ flexDirection: "row", flexWrap: "wrap", gap }}
    >
      {Children.map(children, (child) => (
        <View style={{ width: cardWidth }}>{child}</View>
      ))}
    </View>
  );
}

export const ProductGrid = memo(function ProductGrid({ items }: { items: ProductListItem[] }) {
  return (
    <ProductGridLayout>
      {items.map((product) => <ProductCard key={product.id} product={product} />)}
    </ProductGridLayout>
  );
});

export function ProductGridSkeleton({ count = 6 }: { count?: number } = {}) {
  return (
    <ProductGridLayout loading>
      {Array.from({ length: count }, (_, i) => (
        <View
          key={i}
          style={[styles.card, cardStyles.frame]}
        >
          <View style={cardStyles.image} />
          <View style={{ padding: 12, gap: 8 }}>
            {["100%", "75%", "50%"].map((width) => (
              <View
                key={width}
                style={{
                  width: width as `${number}%`,
                  height: 16,
                  borderRadius: 4,
                  backgroundColor: colors.subtle,
                }}
              />
            ))}
          </View>
        </View>
      ))}
    </ProductGridLayout>
  );
}
