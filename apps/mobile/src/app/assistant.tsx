import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { formatDateTime } from "@remarket/shared";
import type { AiThreadSummary } from "@remarket/shared";
import { SelectField } from "../components/SelectField";
import { Sheet } from "../components/Sheet";
import { Button, colors, Feedback, Screen, styles } from "../components/ui";
import { AssistantFallbackLinks } from "../features/assistant-results";
import { AssistantThread } from "../features/assistant-thread";
import { useAssistantAvailability } from "../services/assistant";
import { api, session } from "../services/runtime";
import { useSession } from "../services/session-context";

export default function Assistant() {
  const { user, loading } = useSession();
  const router = useRouter();
  const config = useAssistantAvailability();

  if (loading) return <Screen><Feedback loading /></Screen>;
  if (!user) {
    return (
      <Screen>
        <View style={styles.card}>
          <Text style={styles.heading}>Đăng nhập để dùng Trợ lý ReMarket</Text>
          <Button title="Đăng nhập" onPress={() => router.push({ pathname: "/login", params: { returnTo: "/assistant" } })} />
        </View>
        <AssistantFallbackLinks />
      </Screen>
    );
  }
  if (user.status === "ACTIVE" && config.data?.enabled && !config.isError) {
    const generation = session.getGeneration();
    return <AssistantSessions key={generation} generation={generation} />;
  }
  return (
    <Screen>
      <Feedback
        loading={user.status === "ACTIVE" && config.isPending}
        error={config.error}
        retry={() => void config.refetch()}
      />
      {!config.isError && (user.status !== "ACTIVE" || config.data?.enabled === false) && (
        <Text style={styles.text}>Trợ lý ReMarket hiện chưa khả dụng.</Text>
      )}
      <AssistantFallbackLinks />
    </Screen>
  );
}

function AssistantSessions({ generation }: { generation: number }) {
  const client = useQueryClient();
  const [selected, setSelected] = useState<string>();
  const [deleteId, setDeleteId] = useState<string>();
  const queryKey = ["ai", "threads", generation];
  const threads = useQuery({ queryKey, queryFn: api.ai.listThreads });
  const threadId = threads.data?.find(({ id }) => id === selected)?.id ?? threads.data?.[0]?.id;
  const create = useMutation({
    mutationFn: api.ai.createThread,
    onSuccess: async (thread) => {
      if (session.getGeneration() !== generation) return;
      await client.cancelQueries({ queryKey });
      if (session.getGeneration() !== generation) return;
      client.setQueryData<AiThreadSummary[]>(queryKey, (items) => [thread, ...(items ?? []).filter(({ id }) => id !== thread.id)]);
      setSelected(thread.id);
    },
  });
  const remove = useMutation({
    mutationFn: api.ai.deleteThread,
    onSuccess: async (_result, id) => {
      if (session.getGeneration() !== generation) return;
      await client.cancelQueries({ queryKey });
      if (session.getGeneration() !== generation) return;
      client.setQueryData<AiThreadSummary[]>(queryKey, (items) => items?.filter((item) => item.id !== id));
      setSelected(undefined);
    },
  });
  const pending = create.isPending || remove.isPending;
  const error = create.error ?? remove.error ?? threads.error;

  if (!threadId) {
    return (
      <Screen>
        <Feedback loading={threads.isPending} error={error} retry={threads.isError ? () => void threads.refetch() : undefined} />
        {threads.isSuccess && (
          <View style={styles.card}>
            <Text style={styles.heading}>Hỏi Trợ lý ReMarket</Text>
            <Text style={styles.muted}>Tìm đồ cũ, tra hướng dẫn và xem số liệu tài khoản.</Text>
            <Button title="Bắt đầu trò chuyện" icon="sparkles-outline" loading={create.isPending} onPress={() => create.mutate()} />
          </View>
        )}
        {error && <AssistantFallbackLinks />}
      </Screen>
    );
  }

  return (
    <View style={styles.page}>
      <View style={sessionStyles.toolbar}>
        <SelectField
          label="Cuộc trò chuyện"
          value={threadId}
          disabled={pending}
          compact
          items={(threads.data ?? []).map(({ id, updated_at }, index, items) => ({
            value: id,
            label: `Phiên ${items.length - index} · ${formatDateTime(updated_at)}`,
          }))}
          onChange={setSelected}
        />
        <View style={styles.row}>
          <Button
            title="Phiên mới"
            icon="add-outline"
            secondary
            compact
            loading={create.isPending}
            disabled={remove.isPending}
            onPress={() => { remove.reset(); create.mutate(); }}
          />
          <Button
            title="Xóa phiên"
            icon="trash-outline"
            ghost
            compact
            disabled={pending}
            onPress={() => setDeleteId(threadId)}
          />
        </View>
        <Feedback error={error} retry={threads.isError ? () => void threads.refetch() : undefined} />
      </View>
      <AssistantThread
        key={threadId}
        threadId={threadId}
        generation={generation}
        onCompleted={() => { setSelected(threadId); void client.invalidateQueries({ queryKey }); }}
      />
      <Sheet visible={!!deleteId} title="Xóa cuộc trò chuyện?" onClose={() => setDeleteId(undefined)}>
        <Text style={styles.text}>Tin nhắn trong phiên này sẽ bị xóa khỏi lịch sử của bạn.</Text>
        <View style={styles.row}>
          <Button title="Giữ lại" secondary onPress={() => setDeleteId(undefined)} />
          <Button
            title="Xóa phiên"
            danger
            onPress={() => {
              if (!deleteId) return;
              setDeleteId(undefined);
              create.reset();
              remove.mutate(deleteId);
            }}
          />
        </View>
      </Sheet>
    </View>
  );
}

const sessionStyles = StyleSheet.create({
  toolbar: { paddingHorizontal: 16, paddingVertical: 8, gap: 8, borderBottomWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
});
