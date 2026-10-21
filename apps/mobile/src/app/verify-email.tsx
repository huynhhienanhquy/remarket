import { useLocalSearchParams } from "expo-router";
import { Text } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { http, session } from "../services/runtime";
import { useSession, queryClient } from "../services/session-context";
import type { EmailVerificationRequest } from "@remarket/shared";
import {
  Button,
  Feedback,
  LoginPrompt,
  useAction,
  styles,
} from "../components/ui";
import { AuthScreen } from "../components/AuthScreen";
export default function VerifyEmail() {
  const { user } = useSession();
  const { token } = useLocalSearchParams<{ token?: string }>();
  const action = useAction();
  const request = useQuery({
    queryKey: ["verification", user?.id],
    enabled: !!user,
    queryFn: () =>
      http.get<EmailVerificationRequest | null>(
        "/auth/mobile/email-verification-request",
      ),
  });
  return (
    <AuthScreen title="Xác minh email">
      <Text style={styles.text}>
        Admin sẽ kiểm tra và xác nhận email của bạn. Sau khi được duyệt, bạn có
        thể đăng tin và nhắn tin.
      </Text>
      {token ? (
        <Button
          title="Gửi yêu cầu từ liên kết"
          disabled={action.pending}
          onPress={() => {
            void action.run(async () => {
              await session.verify(token);
            }, "Đã gửi yêu cầu xác minh cho admin.");
          }}
        />
      ) : !user ? (
        <LoginPrompt />
      ) : (
        <>
          <Text style={styles.heading}>{user.email}</Text>
          <Text style={styles.muted}>
            {user.email_verified_at
              ? "Đã xác minh"
              : request.data
                ? "Đang chờ admin xác nhận"
                : "Chưa gửi yêu cầu"}
          </Text>
          <Button
            title="Gửi yêu cầu xác minh"
            disabled={action.pending || !!user.email_verified_at}
            onPress={() => {
              void action.run(async () => {
                await http.post("/auth/mobile/email-verification-request", {});
                await queryClient.invalidateQueries({
                  queryKey: ["verification"],
                });
              }, "Đã gửi yêu cầu cho admin.");
            }}
          />
          <Button
            title="Kiểm tra lại"
            secondary
            onPress={() => {
              void action.run(() => session.updateIdentity());
            }}
          />
        </>
      )}
      <Feedback error={action.error ?? request.error} />
    </AuthScreen>
  );
}
