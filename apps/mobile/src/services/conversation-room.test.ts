import { describe, expect, it, vi } from "vitest";
import { subscribeConversationRoom } from "./conversation-room";

describe("conversation read receipt subscription", () => {
  it("joins on connection and reconnect, then leaves and stops joining on blur", () => {
    const listeners = new Set<() => void>();
    const socket = {
      connected: false,
      on: vi.fn((_event, callback) => { listeners.add(callback); }),
      off: vi.fn((_event, callback) => { listeners.delete(callback); }),
      emit: vi.fn((_event, _payload, ack?: (result: { ok: boolean }) => void) => { ack?.({ ok: true }); }),
    };
    const joined = vi.fn();
    const stop = subscribeConversationRoom(socket as unknown as Parameters<typeof subscribeConversationRoom>[0], "chat-1", joined);
    expect(socket.emit).not.toHaveBeenCalled();
    for (const callback of listeners) callback();
    for (const callback of listeners) callback();
    expect(joined).toHaveBeenCalledTimes(2);
    expect(socket.emit).toHaveBeenCalledWith("conversation:join", { conversation_id: "chat-1" }, expect.any(Function));
    stop();
    expect(listeners.size).toBe(0);
    expect(socket.emit).toHaveBeenLastCalledWith("conversation:leave", { conversation_id: "chat-1" });
  });

  it("joins an already connected socket and ignores an acknowledgement after blur", () => {
    let acknowledge!: (result: { ok: boolean }) => void;
    const socket = { connected: true, on: vi.fn(), off: vi.fn(), emit: vi.fn((_event, _payload, ack) => { if (ack) acknowledge = ack; }) };
    const joined = vi.fn();
    const stop = subscribeConversationRoom(socket as unknown as Parameters<typeof subscribeConversationRoom>[0], "chat-1", joined);
    acknowledge({ ok: false });
    expect(joined).not.toHaveBeenCalled();
    stop();
    acknowledge({ ok: true });
    expect(joined).not.toHaveBeenCalled();
  });
});
