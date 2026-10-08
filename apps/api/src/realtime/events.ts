import { EventEmitter } from "node:events";
import type { RealtimeEvent } from "../outbox/outbox.js";

const emitter = new EventEmitter();
emitter.setMaxListeners(100);

export function publishRealtimeEvent(event: RealtimeEvent): void {
  emitter.emit("event", event);
}

export function onRealtimeEvent(listener: (event: RealtimeEvent) => void): () => void {
  emitter.on("event", listener);
  return () => emitter.off("event", listener);
}
