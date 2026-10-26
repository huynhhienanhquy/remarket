import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { onRealtimeEvent, publishRealtimeEvent } from "../../src/realtime/events.js";

describe("immediate and durable delivery", () => {
  it("delivers each immutable message once when the relay catches up", () => {
    const listener = vi.fn();
    const stop = onRealtimeEvent(listener);
    const event = { eventType: "message.created", aggregateId: "thread", payload: { message: { id: randomUUID() } } };
    try {
      publishRealtimeEvent(event); publishRealtimeEvent(event);
      expect(listener).toHaveBeenCalledTimes(1);
    } finally { stop(); }
  });
  it("allows durable recovery after immediate delivery throws", () => {
    const stopFailing = onRealtimeEvent(() => { throw new Error("socket failure"); });
    const event = { eventType: "notification.created", aggregateId: "notification", payload: { notification_id: randomUUID() } };
    expect(() => publishRealtimeEvent(event)).toThrow("socket failure");
    stopFailing();
    const listener = vi.fn(), stop = onRealtimeEvent(listener);
    try { publishRealtimeEvent(event); expect(listener).toHaveBeenCalledTimes(1); } finally { stop(); }
  });
});
