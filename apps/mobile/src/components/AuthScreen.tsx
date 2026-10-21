import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Logo } from "./MarketplaceHeader";
import { colors, Screen, styles } from "./ui";

/** The web's compact auth layout, with a readable form width on tablets too. */
export function AuthScreen({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const router = useRouter();
  return (
    <Screen safeTop>
      <View
        style={{
          width: "100%",
          maxWidth: 420,
          alignSelf: "center",
          gap: 24,
          paddingTop: 16,
        }}
      >
        <Logo />
        <View style={{ gap: 8, marginTop: 8 }}>
          <Text accessibilityRole="header" style={styles.title}>
            {title}
          </Text>
          {description && (
            <Text style={[styles.text, { color: colors.muted }]}>
              {description}
            </Text>
          )}
        </View>
        <View style={{ gap: 16 }}>{children}</View>
        <Pressable
          accessibilityRole="link"
          onPress={() => router.navigate("/")}
          style={{ minHeight: 44, justifyContent: "center", marginTop: 16 }}
        >
          <Text style={[styles.label, { color: colors.green }]}>
            ← Quay lại khám phá
          </Text>
        </Pressable>
      </View>
    </Screen>
  );
}
