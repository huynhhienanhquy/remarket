import { EventEmitter } from "node:events";
import type { RealtimeEvent } from "../outbox/outbox.js";

const emitter = new EventEmitter();
emitter.setMaxListeners(100);
const recent = new Map<string, number>();

export function publishRealtimeEvent(event: RealtimeEvent): void {
  const payload = event.payload as { message?: { id?: unknown }; notification_id?: unknown } | null;
  const identity = event.eventType === "message.created" ? payload?.message?.id
    : event.eventType === "notification.created" ? payload?.notification_id : undefined;
  let deliveredKey: string | undefined;
  if (typeof identity === "string") {
    const key = `${event.eventType}:${identity}`;
    const now = Date.now();
    if ((recent.get(key) ?? 0) > now - 300_000) return;
    deliveredKey = key;
  }
  emitter.emit("event", event);
  if (deliveredKey) {
    recent.set(deliveredKey, Date.now());
    while (recent.size > 2_048) recent.delete(recent.keys().next().value!);
  }
}

export function onRealtimeEvent(listener: (event: RealtimeEvent) => void): () => void {
  emitter.on("event", listener);
  return () => emitter.off("event", listener);
}
