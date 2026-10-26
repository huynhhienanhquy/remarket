import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { api } from "../../services/runtime";
import { Button, Feedback, styles, useAction } from "../../components/ui";

export function AdminSystemChatButton({ userId, active, onOpen }: { userId: string; active: boolean; onOpen: () => void }) {
  const router = useRouter();
  const action = useAction();
  return <View style={{ gap: 8 }}>
    <Button title="Nhắn tin hệ thống" disabled={!active} loading={action.pending} onPress={() => {
      void action.run(async () => {
        const { conversation_id } = await api.admin.openSystemConversation(userId);
        onOpen();
        router.push(`/messages/${conversation_id}`);
      });
    }} />
    <Text style={styles.muted}>{active ? "Người nhận sẽ thấy tin nhắn từ Hệ thống ReMarket." : "Tài khoản đang bị khóa nên chưa thể nhận tin nhắn mới."}</Text>
    <Feedback error={action.error} />
  </View>;
}
