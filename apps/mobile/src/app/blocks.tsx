import { Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { http } from "../services/runtime";
import { useSession, queryClient } from "../services/session-context";
import {
  Screen,
  Button,
  Feedback,
  LoginPrompt,
  useAction,
  styles,
} from "../components/ui";
export default function Blocks() {
  const { user } = useSession();
  const action = useAction();
  const result = useQuery({
    queryKey: ["blocks", user?.id],
    enabled: !!user,
    queryFn: () =>
      http.get<{
        user_ids: string[];
        users: Array<{ id: string; name: string }>;
      }>("/mobile/blocks"),
  });
  return (
    <Screen title="Người dùng đã chặn" titleCard>
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
          {result.data?.users.map(({ id, name }) => (
            <View key={id} style={styles.card}>
              <Text style={styles.text}>{name}</Text>
              <Button
                title="Bỏ chặn"
                secondary
                disabled={action.pending}
                onPress={() => {
                  void action.run(async () => {
                    await http.delete(`/mobile/blocks/${id}`);
                    await queryClient.invalidateQueries();
                  });
                }}
              />
            </View>
          ))}
          {result.data?.user_ids.length === 0 && (
            <Text style={styles.muted}>Chưa chặn người dùng nào.</Text>
          )}
        </>
      )}
    </Screen>
  );
}
