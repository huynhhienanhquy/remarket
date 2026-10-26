import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import { api } from "../services/runtime";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigationCounts } from "../services/use-navigation-counts";
import { useSession } from "../services/session-context";
import { colors, IconButton, styles } from "./ui";

export function Logo() {
  const router = useRouter();
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel="ReMarket — Trang chủ"
      onPress={() => router.navigate("/")}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        minHeight: 44,
      }}
    >
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          backgroundColor: colors.green,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={{ fontSize: 14, fontWeight: "700", color: colors.card }}>
          R
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
        ReMarket
      </Text>
    </Pressable>
  );
}

export function MarketplaceHeader({
  search,
  onSearchChange,
  onSearchSubmit,
  showSearch = true,
}: {
  search?: string;
  onSearchChange?: (value: string) => void;
  onSearchSubmit?: () => void;
  showSearch?: boolean;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [input, setInput] = useState("");
  const value = search ?? input;
  const update = onSearchChange ?? setInput;
  const submit =
    onSearchSubmit ??
    (() => router.push({ pathname: "/products", params: { q: value.trim() } }));
  return (
    <View
      style={{
        paddingTop: insets.top,
        backgroundColor: colors.card,
        borderBottomWidth: 1,
        borderColor: colors.border,
      }}
    >
      <View
        style={{
          width: "100%",
          maxWidth: 960,
          alignSelf: "center",
          paddingHorizontal: 16,
        }}
      >
        <View
          style={{
            height: 56,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <Logo />
          <MobileHeaderActions />
        </View>
        {showSearch && (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              borderWidth: 1,
              borderColor: colors.inputBorder,
              borderRadius: 8,
              paddingLeft: 12,
              marginBottom: 12,
            }}
          >
            <Ionicons name="search-outline" size={20} color={colors.muted} />
            <TextInput
              accessibilityLabel="Tìm kiếm sản phẩm"
              placeholder="Bạn đang tìm món đồ gì?"
              placeholderTextColor={colors.muted}
              value={value}
              onChangeText={update}
              onSubmitEditing={submit}
              returnKeyType="search"
              maxLength={100}
              style={[
                styles.text,
                { flex: 1, minWidth: 0, minHeight: 44, paddingVertical: 8 },
              ]}
            />
            {!!value && (
              <IconButton
                icon="close"
                label="Xóa từ khóa"
                onPress={() => update("")}
              />
            )}
            <IconButton
              icon="search-outline"
              label="Tìm kiếm"
              filled
              onPress={submit}
            />
          </View>
        )}
      </View>
    </View>
  );
}

export function MarketplaceFooter() {
  const router = useRouter();
  const { loading } = useSession();
  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: api.categories.tree,
    staleTime: 5 * 60_000,
    enabled: !loading,
  });
  const roots = (categories.data ?? []).filter(
    (item) => item.status === "ACTIVE",
  );
  return (
    <View
      style={{
        borderTopWidth: 1,
        borderColor: colors.border,
        paddingVertical: 24,
        gap: 12,
      }}
    >
      <Logo />
      <Text style={styles.text}>
        Sàn trao đổi món đồ đã qua sử dụng giữa những người dùng thật.
      </Text>
      <Pressable
        accessibilityRole="link"
        onPress={() => router.push("/support")}
        style={{ minHeight: 44, justifyContent: "center" }}
      >
        <Text style={[styles.label, { color: colors.green }]}>
          Trung tâm hỗ trợ
        </Text>
      </Pressable>
      {roots.length > 0 && (
        <>
          <Text style={styles.label}>Danh mục</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {roots.map((category) => (
              <Pressable
                key={category.id}
                accessibilityRole="link"
                onPress={() =>
                  router.navigate({
                    pathname: "/products",
                    params: { category_id: category.id },
                  })
                }
                style={{
                  minHeight: 44,
                  width: "47%",
                  flexGrow: 1,
                  justifyContent: "center",
                }}
              >
                <Text style={styles.muted}>{category.name}</Text>
              </Pressable>
            ))}
          </View>
        </>
      )}
    </View>
  );
}

export function CompactHeader({
  title,
  backTo = "/account",
}: {
  title: string;
  backTo?: "/" | "/account";
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        paddingTop: insets.top,
        backgroundColor: colors.card,
        borderBottomWidth: 1,
        borderColor: colors.border,
      }}
    >
      <View
        style={{
          height: 56,
          paddingHorizontal: 16,
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
        }}
      >
        <IconButton
          icon="chevron-back"
          label="Quay lại"
          onPress={() =>
            router.canGoBack() ? router.back() : router.navigate(backTo)
          }
        />
        <Text
          numberOfLines={1}
          style={{
            flex: 1,
            fontSize: 16,
            lineHeight: 24,
            fontWeight: "600",
            color: colors.text,
          }}
        >
          {title}
        </Text>
        <MobileHeaderActions />
      </View>
    </View>
  );
}

/** One set of utilities and count queries for discovery and account headers. */
export function MobileHeaderActions() {
  const router = useRouter();
  const counts = useNavigationCounts();
  const { user } = useSession();
  const open = (path: "/messages" | "/notifications" | "/cart") => {
    if (user) router.navigate(path);
    else router.push({ pathname: "/login", params: { returnTo: path } });
  };
  return (
    <View style={{ flexDirection: "row", flexShrink: 0 }}>
      <IconButton
        icon="chatbubble-outline"
        label="Tin nhắn"
        badge={counts.data?.messages}
        onPress={() => open("/messages")}
      />
      <IconButton
        icon="notifications-outline"
        label="Thông báo"
        badge={counts.data?.notifications}
        onPress={() => open("/notifications")}
      />
      <IconButton
        icon="cart-outline"
        label="Giỏ hàng"
        badge={counts.data?.cart}
        badgeLabel="sản phẩm"
        onPress={() => open("/cart")}
      />
    </View>
  );
}
