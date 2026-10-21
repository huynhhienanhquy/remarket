import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import {
  validateEmail,
  validateFullName,
  validatePassword,
  validatePasswordConfirm,
  validatePhone,
} from "@remarket/shared";
import { http } from "../services/runtime";
import {
  Field,
  PasswordField,
  Button,
  Feedback,
  useAction,
  styles,
  fieldError,
  colors,
} from "../components/ui";
import { AuthScreen } from "../components/AuthScreen";
export default function Register() {
  const router = useRouter();
  const action = useAction();
  const [accepted, setAccepted] = useState(false);
  const [input, setInput] = useState({
    full_name: "",
    email: "",
    password: "",
    confirm_password: "",
    phone: "",
  });
  return (
    <AuthScreen
      title="Tạo tài khoản"
      description="Tham gia ReMarket để tìm món bạn cần và nhường món bạn không còn dùng."
    >
      <Text style={styles.muted}>
        Bằng việc tạo tài khoản, bạn đồng ý không đăng nội dung vi phạm hoặc
        quấy rối người khác. Tin đăng được kiểm duyệt trước khi hiển thị.
      </Text>
      {(
        [
          ["full_name", "Họ và tên"],
          ["email", "Email"],
          ["phone", "Số điện thoại"],
          ["password", "Mật khẩu"],
          ["confirm_password", "Nhập lại mật khẩu"],
        ] as const
      ).map(([key, label]) => {
        const InputField = key.includes("password") ? PasswordField : Field;
        return (
          <InputField
            key={key}
            label={label}
            error={fieldError(action.error, key)}
            value={input[key]}
            onChangeText={(value) => setInput({ ...input, [key]: value })}
            secureTextEntry={key.includes("password")}
            autoCapitalize={key === "full_name" ? "words" : "none"}
            keyboardType={
              key === "email"
                ? "email-address"
                : key === "phone"
                  ? "phone-pad"
                  : "default"
            }
          />
        );
      })}
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: accepted }}
        onPress={() => setAccepted(!accepted)}
        style={{
          flexDirection: "row",
          alignItems: "center",
          minHeight: 44,
          gap: 12,
        }}
      >
        <View
          style={{
            width: 22,
            height: 22,
            borderRadius: 4,
            borderWidth: 1,
            borderColor: accepted ? colors.green : colors.inputBorder,
            backgroundColor: accepted ? colors.green : colors.card,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          {accepted && (
            <Ionicons name="checkmark" size={16} color={colors.card} />
          )}
        </View>
        <Text style={[styles.muted, { flex: 1 }]}>
          Tôi đồng ý điều khoản cộng đồng
        </Text>
      </Pressable>
      <Feedback error={action.error} />
      <Button
        title="Tạo tài khoản"
        disabled={action.pending || !accepted}
        onPress={() => {
          void action.run(async () => {
            const error =
              validateFullName(input.full_name) ||
              validateEmail(input.email) ||
              validatePhone(input.phone) ||
              validatePassword(input.password) ||
              validatePasswordConfirm(input.password, input.confirm_password);
            if (error) throw new Error(error);
            await http.post("/auth/mobile/register", input);
            router.replace("/login");
          }, "Tài khoản đã tạo. Hãy đăng nhập và gửi yêu cầu xác minh email để bắt đầu đăng bán.");
        }}
      />
      <Button
        title="Đã có tài khoản? Đăng nhập"
        ghost
        onPress={() => router.replace("/login")}
      />
    </AuthScreen>
  );
}
