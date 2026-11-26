import { Tabs } from "expo-router";
import { colors } from "../../components/ui";
import {
  CompactHeader,
  MarketplaceHeader,
} from "../../components/MarketplaceHeader";
export default function TabLayout() {
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
        // Hide the built-in bar without disabling routes used by the custom menu.
        tabBarStyle: { display: "none" },
        tabBarHideOnKeyboard: true,
        headerShadowVisible: false,
      })}
    >
      <Tabs.Screen
        name="index"
        options={{ title: "Khám phá", headerShown: false }}
      />
      <Tabs.Screen
        name="products"
        options={{ headerShown: false }}
      />
      <Tabs.Screen name="favorites" options={{ title: "Yêu thích" }} />
      <Tabs.Screen
        name="sell"
        options={{ title: "Đăng bán", tabBarStyle: { display: "none" } }}
      />
      <Tabs.Screen name="messages" options={{ title: "Tin nhắn" }} />
      <Tabs.Screen name="account" options={{ title: "Tài khoản" }} />
    </Tabs>
  );
}
