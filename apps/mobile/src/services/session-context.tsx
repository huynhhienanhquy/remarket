import { createContext, useContext, useEffect, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { AppState } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import {
  QueryClient,
  QueryClientProvider,
  onlineManager,
  focusManager,
} from "@tanstack/react-query";
import { io } from "socket.io-client";
import type { Socket } from "socket.io-client";
import type { NotificationResponse } from "expo-notifications";
import { nativeNotifications } from "./native-notifications";
import { useRouter } from "expo-router";
import { ApiError } from "@remarket/api-client";
import { session, SOCKET_URL } from "./runtime";
import { registerPush } from "./push";
import { notificationRoute } from "./linking";
import { mergeMessage, mergeReadReceipt } from "@remarket/shared";
import type { Message, MessageHistory, ConversationReadEvent } from "@remarket/shared";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (count, error) =>
        count < 1 &&
        (!(error instanceof ApiError) ||
          error.status === 0 ||
          error.status >= 500),
    },
    mutations: { retry: false },
  },
});
export const useSession = () =>
  useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
    session.getSnapshot,
  );

const SocketContext = createContext<Socket | null>(null);
export const useRealtimeSocket = () => useContext(SocketContext);

export function Providers({ children }: { children: ReactNode }) {
  const state = useSession();
  const viewerId = state.user?.id;
  const viewerStatus = state.user?.status;
  const router = useRouter();
  const [realtimeSocket, setRealtimeSocket] = useState<Socket | null>(null);
  useEffect(() => {
    let identity = session.getSnapshot().user?.id;
    let generation = session.getGeneration();
    const unsubscribe = session.subscribe(() => {
      const next = session.getSnapshot().user?.id;
      if (next !== identity || generation !== session.getGeneration()) {
        queryClient.clear();
        identity = next;
        generation = session.getGeneration();
      }
    });
    void session.restore().catch(() => undefined);
    const network = NetInfo.addEventListener((value) =>
      onlineManager.setOnline(
        value.isConnected !== false && value.isInternetReachable !== false,
      ),
    );
    const appState = AppState.addEventListener("change", (value) => {
      focusManager.setFocused(value === "active");
      if (value === "active")
        void session
          .restore()
          .then(() => queryClient.invalidateQueries())
          .catch(() => undefined);
    });
    return () => {
      unsubscribe();
      network();
      appState.remove();
    };
  }, []);
  useEffect(() => {
    if (!viewerId || viewerStatus !== "ACTIVE") return;
    const socket = io(SOCKET_URL, {
      autoConnect: false,
      auth: (callback) => callback({ token: session.getToken() }),
    });
    setRealtimeSocket(socket);
    let token = session.getToken();
    let disposed = false;
    let recovering = false;
    const recover = async () => {
      if (recovering || disposed || AppState.currentState !== "active") return;
      recovering = true;
      try {
        if (
          (await session.refresh()) &&
          !disposed &&
          session.getSnapshot().user?.status === "ACTIVE"
        )
          socket.connect();
      } catch {
        /* REST surfaces errors and keeps credentials for network failures. */
      } finally {
        recovering = false;
      }
    };
    socket.on("connect", () => {
      void queryClient.invalidateQueries();
    });
    socket.on("disconnect", (reason) => {
      if (reason === "io server disconnect") void recover();
    });
    socket.on("connect_error", (error: Error) => {
      if (error.message === "UNAUTHORIZED") void recover();
    });
    socket.onAny((event: string, payload?: Partial<ConversationReadEvent> & { message?: Message }) => {
      if (event === "message:created" && payload?.conversation_id && payload.message) {
        const key = ["chat", "messages", payload.conversation_id, viewerId];
        void queryClient.cancelQueries({ queryKey: key }).then(() => {
          if (disposed) return;
          queryClient.setQueryData<MessageHistory>(key, (history) => mergeMessage(history, payload.message!));
          if (!queryClient.getQueryData(key)) void queryClient.invalidateQueries({ queryKey: key });
        });
        void queryClient.invalidateQueries({ queryKey: ["chat", "inbox"] });
      } else if (event.startsWith("notification")) {
        void queryClient.invalidateQueries({ queryKey: ["notifications"] });
      } else if (event === "conversation:read") {
        if (payload?.conversation_id && payload.last_message_id && payload.reader_id && payload.read_at) {
          queryClient.setQueryData<MessageHistory>(["chat", "messages", payload.conversation_id, viewerId],
            (history) => mergeReadReceipt(history, payload as ConversationReadEvent));
        }
        void queryClient.invalidateQueries({ queryKey: ["chat", "inbox"] });
        void queryClient.invalidateQueries({ queryKey: ["notifications"] });
      } else void queryClient.invalidateQueries();
      if (event === "email.verified")
        void session.updateIdentity().catch(() => undefined);
    });
    const unsubscribe = session.subscribe(() => {
      if (token !== session.getToken()) {
        token = session.getToken();
        socket.disconnect();
        if (token && AppState.currentState === "active") socket.connect();
      }
    });
    const active = AppState.addEventListener("change", (value) => {
      if (value === "active" && session.getToken()) socket.connect();
      else socket.disconnect();
    });
    if (AppState.currentState === "active") socket.connect();
    void registerPush().catch(() => undefined);
    return () => {
      disposed = true;
      setRealtimeSocket(null);
      unsubscribe();
      active.remove();
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [viewerId, viewerStatus]);
  useEffect(() => {
    const Notifications = nativeNotifications;
    if (!Notifications) return;
    const open = async (response: NotificationResponse) => {
      const data = response.notification.request.content.data;
      if (!data) return;
      if (session.getSnapshot().loading) await session.restore();
      const route = notificationRoute(data.reference_type, data.reference_id, session.getSnapshot().user);
      if (route) router.push(route as Parameters<typeof router.push>[0]);
    };
    const listener =
      Notifications.addNotificationResponseReceivedListener((response) => { void open(response).catch(() => undefined); });
    const received = Notifications.addNotificationReceivedListener(() => {
      void queryClient.invalidateQueries();
    });
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) {
        void open(response).catch(() => undefined);
        void Notifications.clearLastNotificationResponseAsync();
      }
    });
    return () => {
      listener.remove();
      received.remove();
    };
  }, [router]);
  return (
    <QueryClientProvider client={queryClient}>
      <SocketContext.Provider value={realtimeSocket}>{children}</SocketContext.Provider>
    </QueryClientProvider>
  );
}
