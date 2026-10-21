import { destinationAfterLogin } from "../services/linking";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { session } from "../services/runtime";
import {
  Field,
  PasswordField,
  Button,
  Feedback,
  useAction,
  styles,
  colors,
} from "../components/ui";
import { AuthScreen } from "../components/AuthScreen";
export default function Login() {
  const router = useRouter();
  const params = useLocalSearchParams<{ returnTo?: string }>();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const action = useAction();
  return (
    <AuthScreen
      title="Đăng nhập"
      description="Đăng nhập để mua bán hoặc quản trị ReMarket theo quyền tài khoản."
    >
      <Field
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        keyboardType="email-address"
        autoComplete="email"
        placeholder="ban@example.com"
      />
      <PasswordField
        label="Mật khẩu"
        value={password}
        onChangeText={setPassword}
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        autoComplete="current-password"
      />
      <View style={[styles.row, { justifyContent: "flex-end" }]}>
        <Pressable
          accessibilityRole="link"
          onPress={() => router.push("/reset-password")}
          style={{ minHeight: 44, justifyContent: "center" }}
        >
          <Text style={[styles.label, { color: colors.green }]}>
            Quên mật khẩu?
          </Text>
        </Pressable>
      </View>
      <Feedback error={action.error} />
      <Button
        title={action.pending ? "Đang đăng nhập…" : "Đăng nhập"}
        loading={action.pending}
        disabled={action.pending || !email.trim() || !password}
        onPress={() => {
          void action.run(async () => {
            await session.login(email.trim(), password);
            router.replace(
              destinationAfterLogin(
                session.getSnapshot().user!,
                params.returnTo,
              ) as Parameters<typeof router.replace>[0],
            );
          });
        }}
      />
      <Pressable
        accessibilityRole="link"
        onPress={() => router.push("/register")}
        style={{ minHeight: 44, justifyContent: "center" }}
      >
        <Text style={styles.muted}>
          Chưa có tài khoản?{" "}
          <Text style={[styles.label, { color: colors.green }]}>
            Đăng ký ngay
          </Text>
        </Text>
      </Pressable>
    </AuthScreen>
  );
}
