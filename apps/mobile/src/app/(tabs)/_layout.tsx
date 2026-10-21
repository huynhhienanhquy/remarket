import { Tabs } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors } from "../../components/ui";
import {
  CompactHeader,
  MarketplaceHeader,
} from "../../components/MarketplaceHeader";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "../../services/runtime";
import { useSession } from "../../services/session-context";

const icons = {
  index: "home-outline",
  favorites: "heart-outline",
  sell: "add-outline",
  messages: "chatbubble-outline",
  account: "person-outline",
} as const;
export default function TabLayout() {
  const { user } = useSession();
  const insets = useSafeAreaInsets();
  const unread = useQuery({
    queryKey: ["chat", "unread", user?.id],
    queryFn: api.chat.unreadCount,
    enabled: !!user && user.status === "ACTIVE",
    refetchInterval: 60_000,
  });
  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerStyle: { backgroundColor: colors.card },
        header: () =>
          route.name === "account" ? (
            <MarketplaceHeader showSearch={false} />
          ) : (
            <CompactHeader
              title={
                route.name === "favorites"
                  ? "Yêu thích"
                  : route.name === "messages"
                    ? "Tin nhắn"
                    : "Đăng bán"
              }
              backTo={route.name === "sell" ? "/" : "/account"}
            />
          ),
        headerTintColor: colors.text,
        headerTitleAlign: "left",
        headerTitleStyle: { fontSize: 18, fontWeight: "600" },
        tabBarActiveTintColor: colors.green,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          height: 64 + insets.bottom,
          paddingTop: 4,
          paddingBottom: Math.max(4, insets.bottom),
        },
        tabBarActiveBackgroundColor: colors.soft,
        tabBarItemStyle: { borderRadius: 8, marginHorizontal: 2 },
        tabBarLabelStyle: { fontSize: 11, lineHeight: 14 },
        tabBarHideOnKeyboard: true,
        headerShadowVisible: false,
        tabBarIcon: ({ color, size }) => (
          <Ionicons
            name={icons[route.name as keyof typeof icons] ?? "ellipse-outline"}
            color={color}
            size={Math.min(size, 20)}
          />
        ),
      })}
    >
      <Tabs.Screen
        name="index"
        options={{ title: "Khám phá", headerShown: false }}
      />
      <Tabs.Screen
        name="products"
        options={{ href: null, headerShown: false }}
      />
      <Tabs.Screen name="favorites" options={{ title: "Yêu thích" }} />
      <Tabs.Screen
        name="sell"
        options={{ title: "Đăng bán", tabBarStyle: { display: "none" } }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: "Tin nhắn",
          tabBarBadge: unread.data
            ? unread.data > 99
              ? "99+"
              : unread.data
            : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.red, color: colors.card },
        }}
      />
      <Tabs.Screen name="account" options={{ title: "Tài khoản" }} />
    </Tabs>
  );
}
