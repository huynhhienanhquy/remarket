import { useEffect, useState } from "react";
import { Keyboard, Pressable, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { usePathname, useRouter } from "expo-router";
import type { Href } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  accountNavigation,
  mainTab,
  showBottomNavigation,
} from "../services/navigation";
import { useSession } from "../services/session-context";
import { Sheet } from "./Sheet";
import { Button, colors, layout, MenuRow, styles } from "./ui";

const navStyles = StyleSheet.create({
  item: {
    flex: 1,
    minHeight: layout.touchTarget,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  icon: {
    height: 28,
    width: layout.touchTarget,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  selected: { backgroundColor: colors.soft },
});

const tabs = [
  { key: "explore", title: "Khám phá", icon: "home-outline", href: "/" },
  {
    key: "favorites",
    title: "Yêu thích",
    icon: "heart-outline",
    href: "/favorites",
  },
  { key: "sell", title: "Đăng bán", icon: "add-outline", href: "/sell" },
  {
    key: "account",
    title: "Tài khoản",
    icon: "person-outline",
    href: "/account",
  },
] as const;

export function MobileBottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useSession();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", () =>
      setKeyboardVisible(true),
    );
    const hide = Keyboard.addListener("keyboardDidHide", () =>
      setKeyboardVisible(false),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  useEffect(() => setOpen(false), [pathname, user?.id]);
  if (!showBottomNavigation(pathname) || keyboardVisible) return null;
  const navigate = (href: string) => {
    setOpen(false);
    router.navigate(href as Href);
  };
  const login = (returnTo: string) => {
    setOpen(false);
    router.push({ pathname: "/login", params: { returnTo } });
  };
  return (
    <>
      <View
        accessibilityLabel="Điều hướng chính"
        style={{
          backgroundColor: colors.card,
          borderTopWidth: 1,
          borderColor: colors.border,
          paddingBottom: insets.bottom,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            height: layout.tabBar,
            paddingHorizontal: 16,
            gap: 4,
            maxWidth: layout.maxWidth,
            width: "100%",
            alignSelf: "center",
          }}
        >
          {tabs.map((tab) => {
            const active =
              !open &&
              mainTab(pathname) === tab.key &&
              (tab.key === "explore" || !!user);
            return (
              <Pressable
                key={tab.key}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                onPress={() =>
                  !user && tab.key !== "explore"
                    ? login(tab.href)
                    : navigate(tab.href)
                }
                style={navStyles.item}
              >
                <View style={[
                  navStyles.icon,
                  tab.key === "sell" ? { backgroundColor: colors.green } : active && navStyles.selected,
                ]}>
                  <Ionicons
                    name={tab.icon}
                    size={20}
                    color={tab.key === "sell" ? colors.card : active ? colors.green : colors.muted}
                  />
                </View>
                <Text
                  style={{
                    fontSize: 11,
                    lineHeight: 14,
                    color: active ? colors.green : colors.muted,
                    fontWeight: active ? "600" : "400",
                  }}
                >
                  {tab.title}
                </Text>
              </Pressable>
            );
          })}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Menu"
            accessibilityState={{ expanded: open }}
            onPress={() => setOpen(true)}
            style={navStyles.item}
          >
            <View style={[navStyles.icon, open && navStyles.selected]}>
              <Ionicons
                name="menu-outline"
                size={20}
                color={open ? colors.green : colors.muted}
              />
            </View>
            <Text
              style={{
                fontSize: 11,
                lineHeight: 14,
                color: open ? colors.green : colors.muted,
                fontWeight: open ? "600" : "400",
              }}
            >
              Menu
            </Text>
          </Pressable>
        </View>
      </View>
      <Sheet visible={open} title="Menu" onClose={() => setOpen(false)}>
        {user?.status !== "LOCKED" && (
          <MenuRow
            title="Khám phá sản phẩm"
            icon="home-outline"
            onPress={() => navigate("/products")}
          />
        )}
        {user ? (
          <>
            {accountNavigation(user).map((group) => (
              <View key={group.title} style={{ gap: 4 }}>
                <Text
                  style={[
                    styles.meta,
                    {
                      textTransform: "uppercase",
                      fontWeight: "600",
                      letterSpacing: 0.8,
                    },
                  ]}
                >
                  {group.title}
                </Text>
                {group.items.map((item) => (
                  <MenuRow
                    key={item.href}
                    title={item.title}
                    icon={item.icon}
                    onPress={() => navigate(item.href)}
                  />
                ))}
              </View>
            ))}
            {user.role === "ADMIN" && user.status === "ACTIVE" && (
              <MenuRow
                title="Trang quản trị"
                icon="grid-outline"
                onPress={() => navigate("/admin")}
              />
            )}
          </>
        ) : (
          <>
            <Text style={styles.muted}>
              Đăng nhập để quản lý tài khoản, tin đăng và đơn hàng.
            </Text>
            <Button title="Đăng nhập" onPress={() => login(pathname)} />
            <Button
              title="Tạo tài khoản"
              secondary
              onPress={() => navigate("/register")}
            />
          </>
        )}
      </Sheet>
    </>
  );
}
