import "../services/assistant-fetch";
import {
  CopilotKitProvider,
  useAgent,
  useCopilotKit,
} from "@copilotkit/react-native/headless";
import type { Message } from "@copilotkit/react-native/headless";
import { randomUUID } from "expo-crypto";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, colors, layout, styles } from "../components/ui";
import { assistantHeaders } from "../services/assistant";
import { API_URL, session } from "../services/runtime";
import { useSession } from "../services/session-context";
import { AssistantFallbackLinks, AssistantResult } from "./assistant-results";

const AGENT = "marketplace";
const RUNTIME_URL = `${API_URL.replace(/\/$/, "")}/ai/copilotkit`;
const MAX_LENGTH = 1_200;
const STREAM_ERROR = "Chưa thể nhận phản hồi. Bạn có thể thử gửi lại.";
const HISTORY_ERROR = "Chưa thể mở lịch sử cuộc trò chuyện.";
const CANCELLED = "Đã dừng trả lời.";
type ChatMessage = Extract<Message, { role: "assistant" | "user" | "tool" }> & { content: string };

function lastUserMessage(messages: Message[]) {
  const message = messages.at(-1);
  return message?.role === "user" ? [message] : [];
}

function streamNotice(code?: string) {
  if (code === "AI_CANCELLED") return CANCELLED;
  if (code === "AI_TIMEOUT") return "Trợ lý phản hồi quá lâu. Hãy thử lại.";
  return STREAM_ERROR;
}

export function AssistantThread({ threadId, generation, onCompleted }: {
  threadId: string;
  generation: number;
  onCompleted: () => void;
}) {
  useSession();
  const token = session.getToken();
  return (
    <CopilotKitProvider
      runtimeUrl={RUNTIME_URL}
      useSingleEndpoint={false}
      credentials="omit"
      headers={token ? { Authorization: `Bearer ${token}` } : {}}
      messageFilter={lastUserMessage}
      defaultThrottleMs={40}
      onError={() => { /* Stream and connection errors are handled in ThreadChat. */ }}
    >
      <ThreadChat threadId={threadId} generation={generation} onCompleted={onCompleted} />
    </CopilotKitProvider>
  );
}

function ThreadChat({ threadId, generation, onCompleted }: {
  threadId: string;
  generation: number;
  onCompleted: () => void;
}) {
  const { copilotkit } = useCopilotKit();
  const { agent, isReady } = useAgent({
    agentId: "mobile-marketplace",
    runtimeAgentId: AGENT,
    threadId,
  });
  const insets = useSafeAreaInsets();
  const list = useRef<FlatList<ChatMessage>>(null);
  const followLatest = useRef(true);
  const mounted = useRef(false);
  const operation = useRef<symbol | null>(null);
  const retry = useRef<{ text: string; runId: string } | null>(null);
  const [draft, setDraft] = useState("");
  const [historyReady, setHistoryReady] = useState(false);
  const [busy, setBusy] = useState(true);
  const [stoppable, setStoppable] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [notice, setNotice] = useState("");

  const connect = useCallback(async () => {
    if (!mounted.current || operation.current) return;
    const attempt = Symbol();
    operation.current = attempt;
    setBusy(true);
    setNotice("");
    let snapshot = false;
    const sub = agent.subscribe({
      onMessagesSnapshotEvent: () => { snapshot = true; },
      onRunStartedEvent: () => { if (mounted.current) setStoppable(true); },
      onRunErrorEvent: ({ event }) => {
        if (mounted.current) setNotice(streamNotice(event.code));
      },
    });
    try {
      const headers = await assistantHeaders(generation);
      if (!mounted.current) return;
      copilotkit.setHeaders(headers);
      await copilotkit.connectAgent({ agent });
      if (mounted.current && !snapshot) setNotice(HISTORY_ERROR);
    } catch {
      if (mounted.current) setNotice(HISTORY_ERROR);
    } finally {
      sub.unsubscribe();
      if (operation.current === attempt) operation.current = null;
      if (mounted.current && !operation.current) {
        if (snapshot) setHistoryReady(true);
        setBusy(false);
        setStoppable(false);
        setStopping(false);
      }
    }
  }, [agent, copilotkit, generation]);

  useEffect(() => {
    if (!isReady) return;
    mounted.current = true;
    void connect();
    return () => {
      mounted.current = false;
      void agent.detachActiveRun();
    };
  }, [agent, connect, isReady]);

  async function send() {
    const text = draft.trim();
    if (!text || !historyReady || operation.current) return;
    const attempt = Symbol();
    operation.current = attempt;
    setBusy(true);
    setNotice("");
    followLatest.current = true;
    const runId = retry.current?.text === text ? retry.current.runId : randomUUID();
    const previous = [...agent.messages];
    let finished = false;
    let errorCode: string | undefined;
    const sub = agent.subscribe({
      onRunStartedEvent: () => { if (mounted.current) setStoppable(true); },
      onRunFinishedEvent: ({ event }) => { finished = event.runId === runId; },
      onRunErrorEvent: ({ event }) => { errorCode = event.code; },
    });
    try {
      const headers = await assistantHeaders(generation);
      if (!mounted.current) return;
      copilotkit.setHeaders(headers);
      agent.addMessage({ id: runId, role: "user", content: text });
      setDraft("");
      await copilotkit.runAgent({ agent, runId });
    } catch {
      // A retry reuses the run ID so the server can replay a committed answer.
    } finally {
      sub.unsubscribe();
      if (operation.current === attempt) operation.current = null;
      if (mounted.current && !operation.current) {
        setBusy(false);
        setStoppable(false);
        setStopping(false);
        if (finished) {
          retry.current = null;
          onCompleted();
        } else {
          agent.setMessages(previous);
          retry.current = errorCode === "AI_CANCELLED" ? null : { text, runId };
          setDraft(text);
          setNotice(streamNotice(errorCode));
        }
      }
    }
  }

  async function stop() {
    const attempt = operation.current;
    if (!attempt) return;
    setStopping(true);
    try {
      const headers = await assistantHeaders(generation);
      if (mounted.current && operation.current === attempt) {
        copilotkit.setHeaders(headers);
        copilotkit.stopAgent({ agent });
      }
    } catch {
      if (mounted.current && operation.current === attempt) {
        setStopping(false);
        setNotice("Chưa thể dừng trả lời. Hãy thử lại.");
      }
    }
  }

  const messages = agent.messages.filter((message): message is ChatMessage =>
    (message.role === "assistant" || message.role === "user" || message.role === "tool") &&
    typeof message.content === "string" && message.content.length > 0,
  );
  return (
    <KeyboardAvoidingView
      style={styles.page}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={insets.top + layout.header}
    >
      <FlatList
        ref={list}
        data={messages}
        keyExtractor={(message) => message.id}
        keyboardShouldPersistTaps="handled"
        onScroll={({ nativeEvent: { contentOffset, contentSize, layoutMeasurement } }) => {
          followLatest.current = contentSize.height - layoutMeasurement.height - contentOffset.y < 80;
        }}
        scrollEventThrottle={32}
        onContentSizeChange={() => {
          if (followLatest.current) list.current?.scrollToEnd({ animated: false });
        }}
        contentContainerStyle={chatStyles.list}
        renderItem={({ item }) => item.role === "tool" ? (
          <AssistantResult content={item.content} generation={generation} />
        ) : (
          <View style={[styles.card, chatStyles.bubble, item.role === "user" && chatStyles.userBubble]}>
            <Text style={styles.text}>{item.content}</Text>
          </View>
        )}
        ListEmptyComponent={historyReady && !busy ? (
          <View style={styles.card}>
            <Text style={styles.heading}>Bạn cần tìm gì?</Text>
            <Text style={styles.muted}>Tìm đồ cũ theo giá và khu vực, hỏi cách dùng ReMarket hoặc xem số liệu tài khoản của bạn.</Text>
            <Button
              title="Tìm iPhone 13 dưới 8 triệu ở TP.HCM"
              secondary
              onPress={() => setDraft("Tìm iPhone 13 dưới 8 triệu ở TP.HCM")}
            />
          </View>
        ) : undefined}
        ListFooterComponent={busy ? (
          <View style={styles.row} accessibilityLiveRegion="polite">
            <ActivityIndicator color={colors.green} />
            <Text style={styles.muted}>{historyReady ? "Đang xử lý…" : "Đang mở cuộc trò chuyện…"}</Text>
          </View>
        ) : undefined}
      />
      <View style={[chatStyles.composer, { paddingBottom: Math.max(12, insets.bottom) }]}>
        {!!notice && (
          <View>
            <Text accessibilityRole="alert" style={notice === CANCELLED ? styles.muted : styles.error}>{notice}</Text>
            {notice !== CANCELLED && <AssistantFallbackLinks />}
            {!busy && <Button title="Tải lại cuộc trò chuyện" secondary compact onPress={() => void connect()} />}
          </View>
        )}
        <View style={chatStyles.inputRow}>
          <TextInput
            accessibilityLabel="Câu hỏi cho Trợ lý ReMarket"
            placeholder="Nhập câu hỏi…"
            placeholderTextColor={colors.muted}
            value={draft}
            onChangeText={(text) => {
              if (retry.current?.text !== text.trim()) retry.current = null;
              setDraft(text);
            }}
            maxLength={MAX_LENGTH}
            editable={historyReady && !busy}
            multiline
            style={[styles.input, chatStyles.input]}
          />
          {stoppable ? (
            <Button title="Dừng" icon="stop-outline" loading={stopping} secondary compact onPress={() => void stop()} />
          ) : (
            <Button title="Gửi" icon="send-outline" disabled={busy || !historyReady || !draft.trim()} compact onPress={() => void send()} />
          )}
        </View>
        <Text style={styles.meta}>Đừng nhập email, số điện thoại hoặc địa chỉ chi tiết.</Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const chatStyles = StyleSheet.create({
  list: { padding: 16, gap: 10, width: "100%", maxWidth: 760, alignSelf: "center" },
  bubble: { alignSelf: "flex-start", maxWidth: "92%", padding: 12 },
  userBubble: { alignSelf: "flex-end", backgroundColor: colors.soft },
  composer: { padding: 12, gap: 8, backgroundColor: colors.card, borderTopWidth: 1, borderColor: colors.border },
  inputRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  input: { flex: 1, minWidth: 0, minHeight: 48, maxHeight: 120, textAlignVertical: "top" },
});
