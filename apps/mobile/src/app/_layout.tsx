import { Stack, usePathname, useRouter } from "expo-router";
import { useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Providers, useSession } from "../services/session-context";
import { colors } from "../components/ui";
export { ErrorBoundary } from "expo-router";

function AccessWatcher() {
  const { user } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  useEffect(() => {
    if (
      user?.status === "LOCKED" &&
      !["/account", "/notifications", "/orders", "/support", "/login"].some(
        (route) => pathname === route || pathname.startsWith(`${route}/`),
      )
    )
      router.replace("/account");
  }, [user?.status, pathname, router]);
  return null;
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <Providers>
        <AccessWatcher />
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerTintColor: colors.text,
            headerTitleAlign: "left",
            headerTitleStyle: { fontSize: 18, fontWeight: "600" },
            headerShadowVisible: false,
            headerStyle: { backgroundColor: colors.card },
            headerBackTitle: "Quay lại",
            headerTitle: "ReMarket",
            contentStyle: { backgroundColor: colors.bg },
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="login" options={{ headerShown: false }} />
          <Stack.Screen name="register" options={{ headerShown: false }} />
          <Stack.Screen
            name="reset-password"
            options={{ headerShown: false }}
          />
          <Stack.Screen name="admin" options={{ headerShown: false }} />
          <Stack.Screen
            name="products/[id]"
            options={{ title: "Chi tiết sản phẩm" }}
          />
          <Stack.Screen
            name="users/[id]"
            options={{ title: "Hồ sơ người bán" }}
          />
          <Stack.Screen
            name="edit-product/[id]"
            options={{ title: "Chỉnh sửa tin" }}
          />
          <Stack.Screen name="cart" options={{ title: "Giỏ hàng" }} />
          <Stack.Screen name="checkout" options={{ title: "Thanh toán" }} />
          <Stack.Screen
            name="my-products"
            options={{ title: "Tin đăng của tôi" }}
          />
          <Stack.Screen name="orders/index" options={{ title: "Đơn hàng" }} />
          <Stack.Screen
            name="orders/[id]"
            options={{ title: "Chi tiết đơn hàng" }}
          />
          <Stack.Screen name="notifications" options={{ title: "Thông báo" }} />
          <Stack.Screen
            name="messages/[id]"
            options={{ title: "Trò chuyện" }}
          />
          <Stack.Screen
            name="support/index"
            options={{ title: "Trung tâm hỗ trợ" }}
          />
          <Stack.Screen
            name="support/new"
            options={{ title: "Tạo yêu cầu hỗ trợ" }}
          />
          <Stack.Screen
            name="support/[id]"
            options={{ title: "Chi tiết hỗ trợ" }}
          />
          <Stack.Screen name="verify-email" options={{ headerShown: false }} />
          <Stack.Screen
            name="blocks"
            options={{ title: "Người dùng đã chặn" }}
          />
          <Stack.Screen name="reports" options={{ title: "Báo cáo của tôi" }} />
        </Stack>
      </Providers>
    </SafeAreaProvider>
  );
}
