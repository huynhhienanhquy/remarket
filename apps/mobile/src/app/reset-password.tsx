import { useEffect, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { http, session } from "../services/runtime";
import {
  validateEmail,
  validatePassword,
  validatePasswordConfirm,
} from "@remarket/shared";
import { Field, Button, Feedback, useAction } from "../components/ui";
import { AuthScreen } from "../components/AuthScreen";
export default function ResetPassword() {
  const params = useLocalSearchParams<{ token?: string }>();
  const router = useRouter();
  const [token] = useState(params.token);
  useEffect(() => {
    if (params.token) router.setParams({ token: undefined });
  }, [params.token, router]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const action = useAction();
  return (
    <AuthScreen
      title={token ? "Đặt mật khẩu mới" : "Khôi phục mật khẩu"}
      description={
        token
          ? "Chọn mật khẩu mới để bảo vệ tài khoản của bạn."
          : "Nhập email tài khoản để nhận liên kết khôi phục mật khẩu."
      }
    >
      <Field
        label={token ? "Mật khẩu mới" : "Email tài khoản"}
        value={token ? password : email}
        onChangeText={token ? setPassword : setEmail}
        secureTextEntry={!!token}
        autoCapitalize="none"
      />
      {token && (
        <Field
          label="Nhập lại mật khẩu mới"
          value={confirm}
          onChangeText={setConfirm}
          secureTextEntry
        />
      )}
      <Feedback error={action.error} />
      <Button
        title={token ? "Đổi mật khẩu" : "Gửi liên kết khôi phục"}
        disabled={action.pending}
        onPress={() => {
          void action.run(
            async () => {
              if (token) {
                const error =
                  validatePassword(password) ||
                  validatePasswordConfirm(password, confirm);
                if (error) throw new Error(error);
                await http.post("/auth/mobile/reset-password", {
                  token,
                  password,
                });
                await session.expire();
                router.replace("/login");
              } else {
                const error = validateEmail(email);
                if (error) throw new Error(error);
                await http.post("/auth/mobile/forgot-password", {
                  email: email.trim(),
                });
              }
            },
            token
              ? "Đã đổi mật khẩu. Hãy đăng nhập lại."
              : "Nếu tài khoản tồn tại, bạn sẽ nhận được liên kết khôi phục.",
          );
        }}
      />
    </AuthScreen>
  );
}
