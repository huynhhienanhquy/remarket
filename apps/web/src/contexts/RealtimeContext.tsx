import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { io } from "socket.io-client";
import type { Socket } from "socket.io-client";
import { useQueryClient } from "@tanstack/react-query";
import { useSession } from "./SessionContext";
import { SOCKET_URL } from "../config/environment";
import { http, subscribeAccessToken } from "../services/http";

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
    socket.on("connect", () => { authRetried = false; setState({ socket, connected: true }); invalidate(); });
    socket.on("disconnect", (reason) => { if (!disposed) setState({ socket, connected: false }); if (reason === "io server disconnect") void recover(); });
    socket.on("connect_error", (error: Error) => { if (!disposed) setState({ socket, connected: false }); if (error.message === "UNAUTHORIZED") void recover(); });
    socket.onAny((event: string) => {
      if (event === "message:created" || event === "conversation:read") invalidate(["chat", "notifications"]);
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
