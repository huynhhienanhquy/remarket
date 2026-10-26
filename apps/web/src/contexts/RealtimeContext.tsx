import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { io } from "socket.io-client";
import type { Socket } from "socket.io-client";
import { useQueryClient } from "@tanstack/react-query";
import { useSession } from "./SessionContext";
import { SOCKET_URL } from "../config/environment";
import { http, subscribeAccessToken } from "../services/http";
import { mergeMessage, mergeReadReceipt } from "@remarket/shared";
import type { Message, MessageHistory, ConversationReadEvent } from "@remarket/shared";

const RealtimeContext = createContext<{ socket: Socket | null; connected: boolean }>({ socket: null, connected: false });
export const useRealtime = () => useContext(RealtimeContext);

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { viewer, refresh } = useSession();
  const viewerId = viewer?.id;
  const viewerStatus = viewer?.status;
  const client = useQueryClient();
  const [state, setState] = useState<{ socket: Socket | null; connected: boolean }>({ socket: null, connected: false });
  useEffect(() => {
    if (!viewerId || viewerStatus !== "ACTIVE") return;
    let disposed = false;
    let reauthenticating = false;
    let authRetried = false;
    let connectedOnce = false;
    // Queries mounted with this provider already fetch fresh data. Revalidate
    // older cached data on the first handshake, and everything on reconnect
    // to recover events missed while the socket was offline.
    const cachedBeforeConnect = new Map(client.getQueryCache().getAll()
      .filter((query) => query.state.dataUpdatedAt > 0)
      .map((query) => [query.queryHash, query.state.dataUpdatedAt]));
    const socket = io(SOCKET_URL || window.location.origin, { autoConnect: false, withCredentials: true, auth: (callback) => callback({ token: http.getAccessToken() }) });
    const invalidate = (keys = ["chat", "notifications", "orders", "products", "support", "admin", "cart", "favorites", "profiles", "checkout"]) => {
      for (const key of keys) void client.invalidateQueries({ queryKey: [key] });
    };
    const recover = async () => {
      if (disposed || reauthenticating || authRetried) return;
      reauthenticating = true;
      authRetried = true;
      try {
        const user = await http.restoreSession("refresh");
        if (!disposed && user?.id === viewerId && user.status === "ACTIVE") socket.connect();
      } catch { /* REST queries surface a retryable session/network error. */ }
      finally { reauthenticating = false; }
    };
    socket.on("connect", () => {
      authRetried = false;
      setState({ socket, connected: true });
      if (connectedOnce) invalidate();
      else void client.invalidateQueries({
        predicate: (query) => cachedBeforeConnect.get(query.queryHash) === query.state.dataUpdatedAt,
      }, { cancelRefetch: false });
      connectedOnce = true;
    });
    socket.on("disconnect", (reason) => { if (!disposed) setState({ socket, connected: false }); if (reason === "io server disconnect") void recover(); });
    socket.on("connect_error", (error: Error) => { if (!disposed) setState({ socket, connected: false }); if (error.message === "UNAUTHORIZED") void recover(); });
    socket.onAny((event: string, payload?: Partial<ConversationReadEvent> & { message?: Message }) => {
      if (event === "message:created" && payload?.conversation_id && payload.message) {
        const key = ["chat", "messages", payload.conversation_id];
        // Cancel a stale refetch before applying the event, so it cannot erase
        // a message already committed and delivered by the server.
        void client.cancelQueries({ queryKey: key }).then(() => {
          if (disposed) return;
          client.setQueriesData<MessageHistory>({ queryKey: key }, (history) => mergeMessage(history, payload.message!));
          if (!client.getQueryData(key)) void client.invalidateQueries({ queryKey: key });
        });
        void client.invalidateQueries({ queryKey: ["chat", "conversations"] });
        void client.invalidateQueries({ queryKey: ["chat", "unread-count"] });
        // notification.created follows for the recipient. Let that event
        // refresh badges once instead of restarting the same request twice.
      }
      else if (event === "conversation:read") {
        if (payload?.conversation_id && payload.last_message_id && payload.reader_id && payload.read_at) {
          client.setQueriesData<MessageHistory>({ queryKey: ["chat", "messages", payload.conversation_id] },
            (history) => mergeReadReceipt(history, payload as ConversationReadEvent));
        }
        void client.invalidateQueries({ queryKey: ["chat", "conversations"] });
        invalidate(["notifications"]);
      }
      else if (event === "message:created") invalidate(["chat", "notifications"]);
      else if (event.startsWith("order")) invalidate(["orders", "products", "cart", "checkout", "notifications", "admin"]);
      else if (event.startsWith("support")) invalidate(["support", "orders", "admin", "notifications"]);
      else if (event === "email.verified") { invalidate(["notifications", "admin", "email-verification"]); void refresh().catch(() => {}); }
      else if (event.startsWith("notification")) invalidate(["notifications", "admin", "email-verification"]);
      else invalidate();
    });
    const unsubscribe = subscribeAccessToken((token) => {
      if (disposed) return;
      socket.disconnect();
      if (token) socket.connect();
    });
    if (http.getAccessToken()) socket.connect();
    setState({ socket, connected: false });
    return () => { disposed = true; unsubscribe(); socket.removeAllListeners(); socket.disconnect(); };
  }, [viewerId, viewerStatus, client, refresh]);
  const active = viewer?.status === "ACTIVE";
  return <RealtimeContext.Provider value={active ? state : { socket: null, connected: false }}>{children}</RealtimeContext.Provider>;
}
