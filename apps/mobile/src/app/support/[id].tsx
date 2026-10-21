import { TICKET_STATUS_LABELS } from "@remarket/shared";
import { useState } from "react";
import { Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { formatDateTime, validateSupportMessage } from "@remarket/shared";
import { api } from "../../services/runtime";
import { useSession } from "../../services/session-context";
import {
  Screen,
  Field,
  Button,
  Feedback,
  LoginPrompt,
  useAction,
  styles,
} from "../../components/ui";
export default function SupportDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useSession();
  const action = useAction();
  const [message, setMessage] = useState("");
  const result = useQuery({
    queryKey: ["support", id, user?.id],
    enabled: !!user,
    queryFn: () => api.support.detail(id),
  });
  return (
    <Screen title={result.data?.subject ?? "Yêu cầu hỗ trợ"}>
      {!user ? (
        <LoginPrompt />
      ) : (
        <>
          <Feedback
            loading={result.isPending}
            error={result.error ?? action.error}
            retry={() => {
              void result.refetch();
            }}
          />
          <Text style={styles.muted}>
            {result.data ? TICKET_STATUS_LABELS[result.data.status].label : ""}{" "}
            · {result.data?.code}
          </Text>
          {result.data?.resolution_note && (
            <View style={styles.card}>
              <Text style={styles.heading}>Kết luận xử lý</Text>
              <Text style={styles.text}>{result.data.resolution_note}</Text>
            </View>
          )}
          {result.data?.assigned_admin_name && (
            <Text style={styles.muted}>
              Phụ trách: {result.data.assigned_admin_name}
            </Text>
          )}
          {result.data?.messages.map((item) => (
            <View key={item.id} style={styles.card}>
              <Text style={styles.heading}>{item.sender.name}</Text>
              <Text style={styles.text}>{item.message}</Text>
              <Text style={styles.meta}>{formatDateTime(item.created_at)}</Text>
            </View>
          ))}
          {result.data?.allowed_actions.includes("reply") && (
            <>
              <Field
                label="Trả lời"
                value={message}
                onChangeText={setMessage}
                multiline
              />
              <Button
                title="Gửi trả lời"
                disabled={action.pending || !message.trim()}
                onPress={() => {
                  void action.run(async () => {
                    const error = validateSupportMessage(message);
                    if (error) throw new Error(error);
                    await api.support.reply(id, message.trim());
                    setMessage("");
                    await result.refetch();
                  });
                }}
              />
            </>
          )}
          {result.data?.allowed_actions.includes("close") && (
            <Button
              title="Đóng yêu cầu"
              secondary
              disabled={action.pending}
              onPress={() => {
                void action.run(async () => {
                  await api.support.close(id);
                  await result.refetch();
                });
              }}
            />
          )}
        </>
      )}
    </Screen>
  );
}
