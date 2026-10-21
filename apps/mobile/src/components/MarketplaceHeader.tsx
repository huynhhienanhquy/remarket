import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "../services/runtime";
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
  const { user } = useSession();
  const [input, setInput] = useState("");
  const value = search ?? input;
  const update = onSearchChange ?? setInput;
  const notifications = useQuery({
    queryKey: ["notifications", "unread", user?.id],
    queryFn: api.notifications.unreadCount,
    enabled: !!user,
    refetchInterval: 60_000,
  });
  const cart = useQuery({
    queryKey: ["cart", user?.id],
    queryFn: api.cart.get,
    enabled: !!user && user.status === "ACTIVE",
  });
  const cartCount = cart.data?.groups.reduce(
    (total, group) => total + group.items.length,
    0,
  );
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
          <View style={{ flexDirection: "row", gap: 4 }}>
            <IconButton
              icon="cart-outline"
              label="Giỏ hàng"
              badge={cartCount}
              badgeLabel="sản phẩm"
              onPress={() => router.push("/cart")}
            />
            {user && (
              <>
                <IconButton
                  icon="notifications-outline"
                  label="Thông báo"
                  badge={notifications.data}
                  onPress={() => router.push("/notifications")}
                />
                <IconButton
                  icon="person-outline"
                  label="Tài khoản"
                  onPress={() => router.navigate("/account")}
                />
              </>
            )}
          </View>
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
  return (
    <View
      style={{
        borderTopWidth: 1,
        borderColor: colors.border,
        paddingTop: 24,
        gap: 12,
      }}
    >
      <Logo />
      <Text style={styles.muted}>Nơi món đồ cũ tìm thấy giá trị mới.</Text>
      <Pressable
        accessibilityRole="link"
        onPress={() => router.push("/support")}
        style={{ minHeight: 44, justifyContent: "center" }}
      >
        <Text style={[styles.label, { color: colors.green }]}>
          Trung tâm hỗ trợ
        </Text>
      </Pressable>
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
          onPress={() => router.navigate(backTo)}
        />
        <Text
          numberOfLines={1}
          style={{
            flex: 1,
            fontSize: 18,
            lineHeight: 28,
            fontWeight: "600",
            color: colors.text,
          }}
        >
          {title}
        </Text>
        {backTo === "/account" && (
          <IconButton
            icon="menu-outline"
            label="Menu tài khoản"
            onPress={() => router.navigate("/account")}
          />
        )}
      </View>
    </View>
  );
}
