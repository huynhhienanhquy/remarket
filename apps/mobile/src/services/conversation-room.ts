import type { Socket } from "socket.io-client";

/** Join again after reconnects; release the room when the screen loses focus. */
export function subscribeConversationRoom(
  socket: Pick<Socket, "on" | "off" | "emit" | "connected">,
  conversationId: string,
  onJoined: () => void,
): () => void {
  let active = true;
  const join = () => socket.emit(
    "conversation:join",
    { conversation_id: conversationId },
    (ack: { ok: boolean }) => { if (active && ack.ok) onJoined(); },
  );
  socket.on("connect", join);
  if (socket.connected) join();
  return () => {
    active = false;
    socket.off("connect", join);
    socket.emit("conversation:leave", { conversation_id: conversationId });
  };
}
