import { useCallback, useEffect, useRef, useState } from "react";
import {
  AppState,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Text,
  View,
} from "react-native";
import type { ViewToken } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { randomUUID } from "expo-crypto";
import type { Message } from "@remarket/shared";
import { mergeMessage } from "@remarket/shared";
import type { MessageHistory } from "@remarket/shared";
import { api, session } from "../../services/runtime";
import {
  useSession,
  useRealtimeSocket,
  queryClient,
} from "../../services/session-context";
import { subscribeConversationRoom } from "../../services/conversation-room";
import {
  canRetryMessage,
  messageDraftError,
} from "../../services/message-draft";
import {
  Screen,
  Field,
  Button,
  Feedback,
  LoginPrompt,
  useAction,
  styles,
  colors,
  MenuRow,
} from "../../components/ui";
export default function Conversation() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useSession();
  const action = useAction();
  const socket = useRealtimeSocket();
  const [content, setContent] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [sending, setSending] = useState<Message | null>(null);
  const [failed, setFailed] = useState<{
    content: string;
    client_message_id: string;
  } | null>(null);
  const focused = useRef(false);
  const lastRead = useRef("");
  const readPending = useRef(false);
  const visible = useRef<Message[]>([]);
  useEffect(() => {
    setContent("");
    setFailed(null);
    setSending(null);
    setFieldError(null);
    lastRead.current = "";
    visible.current = [];
  }, [id, user?.id]);
  const detail = useQuery({
    queryKey: ["chat", "detail", id, user?.id],
    queryFn: () => api.chat.detail(id),
    enabled: !!user,
  });
  const messages = useInfiniteQuery({
    queryKey: ["chat", "messages", id, user?.id],
    enabled: !!user,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => api.chat.messages(id, pageParam),
    getNextPageParam: (page) => page.next_cursor ?? undefined,
  });
  const markVisible = useCallback(() => {
    if (
      !focused.current ||
      AppState.currentState !== "active" ||
      readPending.current
    )
      return;
    const newest = visible.current
      .filter((item) => item.sender_id !== user?.id)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    if (!newest || newest.id === lastRead.current) return;
    readPending.current = true;
    void api.chat
      .markRead(id, newest.id)
      .then(() => {
        lastRead.current = newest.id;
        void queryClient.invalidateQueries({ queryKey: ["chat", "inbox"] });
        void queryClient.invalidateQueries({ queryKey: ["notifications", "navigation-counts"] });
      })
      .catch(() => undefined)
      .finally(() => {
        readPending.current = false;
      });
  }, [id, user?.id]);
  useFocusEffect(
    useCallback(() => {
      if (!socket || !user) return;
      return subscribeConversationRoom(socket, id, () => {
        void queryClient.invalidateQueries({
          queryKey: ["chat", "messages", id, user.id],
        });
      });
    }, [socket, id, user]),
  );
  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      markVisible();
      return () => {
        focused.current = false;
      };
    }, [markVisible]),
  );
  useEffect(() => {
    const listener = AppState.addEventListener("change", () => markVisible());
    return () => listener.remove();
  }, [markVisible]);
  const send = (entry: { content: string; client_message_id: string }) => {
    const error = messageDraftError(entry.content);
    setFieldError(error);
    if (error) return;
    void action.run(async () => {
      setSending({ id: entry.client_message_id, client_message_id: entry.client_message_id, sender_id: user!.id,
        content: entry.content, created_at: new Date().toISOString(), read_at: null });
      setContent("");
      try {
        const { message } = await api.chat.send(id, entry);
        const key = ["chat", "messages", id, user?.id];
        await queryClient.cancelQueries({ queryKey: key });
        if (session.getSnapshot().user?.id !== message.sender_id) return;
        queryClient.setQueryData<MessageHistory>(key, (history) => mergeMessage(history, message));
      } catch (error) {
        setFailed(canRetryMessage(error) ? entry : null);
        setContent((draft) => draft || entry.content);
        throw error;
      } finally {
        setSending(null);
      }
      setFailed(null);
      void queryClient.invalidateQueries({ queryKey: ["chat", "inbox"] });
    });
  };
  if (!user)
    return (
      <Screen title="Tin nhắn">
        <LoginPrompt />
      </Screen>
    );
  const items = Array.from(
    new Map(
      [...(messages.data?.pages.flatMap((page) => page.items) ?? []),
        ...(sending && !messages.data?.pages.some((page) => page.items.some((item) =>
          item.sender_id === sending.sender_id && item.client_message_id === sending.client_message_id)) ? [sending] : [])].map((item) => [
        item.id,
        item,
      ]),
    ).values(),
  ).sort(
    (a, b) =>
      b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id),
  );
  return (
    <KeyboardAvoidingView
      style={styles.page}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={90}
    >
      <View style={{ padding: 16, gap: 6 }}>
        {detail.data && (
          detail.data.counterparty.is_system ? <View style={{ gap: 4 }}>
            <Text accessibilityRole="header" style={styles.heading}>Hệ thống ReMarket</Text>
            <Text style={styles.muted}>Kênh nhắn tin chính thức của ReMarket</Text>
          </View> : <MenuRow
            title={detail.data.counterparty.name}
            description={detail.data.is_system ? "Kênh nhắn tin chính thức của ReMarket" : detail.data.product?.title}
            icon="person-circle-outline"
            onPress={() =>
              router.push(`/users/${detail.data!.counterparty.id}`)
            }
          />
        )}
        {detail.data?.product && (
          <Button
            title="Xem món đồ"
            secondary
            onPress={() => router.push(`/products/${detail.data!.product!.id}`)}
          />
        )}
        <Feedback
          error={detail.error ?? messages.error ?? action.error}
          loading={messages.isPending}
        />
        {messages.hasNextPage && (
          <Button
            title="Tin nhắn cũ hơn"
            secondary
            disabled={messages.isFetchingNextPage}
            onPress={() => {
              void messages.fetchNextPage();
            }}
          />
        )}
      </View>
      <FlatList
        data={items}
        inverted
        maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, gap: 12 }}
        viewabilityConfig={{
          itemVisiblePercentThreshold: 80,
          minimumViewTime: 500,
        }}
        onViewableItemsChanged={({
          viewableItems,
        }: {
          viewableItems: ViewToken<Message>[];
        }) => {
          visible.current = viewableItems.map((item) => item.item);
          markVisible();
        }}
        renderItem={({ item }) => (
          <View
            style={[
              styles.card,
              {
                alignSelf:
                  item.sender_id === user.id ? "flex-end" : "flex-start",
                maxWidth: "85%",
                padding: 12,
                borderRadius: 16,
                backgroundColor:
                  item.sender_id === user.id ? colors.soft : colors.card,
              },
            ]}
          >
            {(item.is_system || (item.sender_id === user.id && detail.data?.is_system && user.role === "ADMIN")) && <Text style={[styles.meta, { color: colors.green, fontWeight: "600" }]}>Hệ thống ReMarket</Text>}
            <Text style={styles.text}>{item.content}</Text>
            <Text style={styles.meta}>
              {new Date(item.created_at).toLocaleTimeString("vi-VN")}{" "}
              {item.id === sending?.id ? "· Đang gửi" : ""}
              {item.sender_id === user.id && item.read_at ? "· Đã đọc" : ""}
            </Text>
          </View>
        )}
      />
      <View
        style={{
          padding: 16,
          paddingBottom: Math.max(16, insets.bottom),
          gap: 8,
          backgroundColor: colors.card,
          borderTopWidth: 1,
          borderColor: colors.border,
        }}
      >
        <Text style={styles.muted}>{detail.data?.unavailable_reason}</Text>
        <Field
          label="Tin nhắn"
          style={{ minHeight: 44, maxHeight: 120 }}
          placeholder="Nhập tin nhắn…"
          maxLength={5000}
          value={content}
          onChangeText={(value) => {
            setContent(value);
            setFieldError(null);
            setFailed(null);
          }}
          multiline
        />
        {fieldError && <Text style={styles.error}>{fieldError}</Text>}
        {failed ? (
          <>
            <Text style={styles.error}>Chưa gửi được: {failed.content}</Text>
            <Button
              title="Thử gửi lại"
              disabled={action.pending || detail.data?.can_send === false}
              onPress={() => send(failed)}
            />
          </>
        ) : (
          <>
            <Button
              title="Gửi"
              disabled={
                action.pending ||
                !content.trim() ||
                detail.isPending ||
                !!detail.error ||
                detail.data?.can_send !== true
              }
              onPress={() =>
                send({
                  content: content.trim(),
                  client_message_id: randomUUID(),
                })
              }
            />
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}
