import { Stack, useRouter } from "expo-router";
import { useState } from "react";
import { Sheet } from "../../components/Sheet";
import { adminNavigation } from "../../features/admin/navigation";
import { useSession } from "../../services/session-context";
import {
  colors,
  Feedback,
  LoginPrompt,
  Screen,
  EmptyState,
  IconButton,
  MenuRow,
} from "../../components/ui";

export default function AdminLayout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const state = useSession();
  const router = useRouter();
  if (state.loading)
    return (
      <Screen>
        <Feedback loading />
      </Screen>
    );
  if (!state.user)
    return (
      <Screen title="Quản trị ReMarket">
        <LoginPrompt />
      </Screen>
    );
  if (state.user.role !== "ADMIN" || state.user.status !== "ACTIVE")
    return (
      <Screen>
        <EmptyState
          title="Không có quyền quản trị"
          description="Khu vực này dành cho quản trị viên đang hoạt động."
        />
      </Screen>
    );
  return (
    <>
      <Stack
        screenOptions={{
          headerTintColor: colors.text,
          headerTitleAlign: "left",
          headerTitleStyle: { fontSize: 18, fontWeight: "600" },
          headerShadowVisible: false,
          headerStyle: { backgroundColor: colors.card },
          headerBackTitle: "Quản trị",
          headerLeft: () => (
            <IconButton
              icon="menu-outline"
              label="Menu quản trị"
              onPress={() => setMenuOpen(true)}
            />
          ),
          headerRight: () => (
            <IconButton
              icon="grid-outline"
              label="Tổng quan quản trị"
              onPress={() => router.replace("/admin")}
            />
          ),
        }}
      >
        <Stack.Screen name="index" options={{ title: "Quản trị ReMarket" }} />
        <Stack.Screen name="users" options={{ title: "Người dùng" }} />
        <Stack.Screen
          name="products"
          options={{ title: "Kiểm duyệt tin đăng" }}
        />
        <Stack.Screen name="categories" options={{ title: "Danh mục" }} />
        <Stack.Screen name="reports" options={{ title: "Báo cáo vi phạm" }} />
        <Stack.Screen name="reviews" options={{ title: "Đánh giá" }} />
        <Stack.Screen name="support" options={{ title: "Hỗ trợ" }} />
        <Stack.Screen
          name="email-verifications"
          options={{ title: "Xác minh email" }}
        />
        <Stack.Screen name="audit" options={{ title: "Nhật ký quản trị" }} />
      </Stack>
      <Sheet
        visible={menuOpen}
        title="Quản trị ReMarket"
        onClose={() => setMenuOpen(false)}
      >
        {adminNavigation.map((item) => (
          <MenuRow
            key={item.path}
            title={item.title}
            icon={item.icon}
            onPress={() => {
              setMenuOpen(false);
              router.navigate(item.path);
            }}
          />
        ))}
        <MenuRow
          title="Về marketplace"
          icon="home-outline"
          onPress={() => {
            setMenuOpen(false);
            router.replace("/");
          }}
        />
      </Sheet>
    </>
  );
}
