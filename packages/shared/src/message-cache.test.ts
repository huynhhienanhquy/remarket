import { describe, expect, it } from "vitest";
import type { Message } from "./dto.js";
import { mergeMessage, mergeReadReceipt } from "./message-cache.js";

const message: Message = { id: "new", sender_id: "seller", client_message_id: "client-new", content: "Hello",
  created_at: "2026-10-22T00:00:02.000Z", read_at: null };
describe("realtime message reconciliation", () => {
  it("updates only received messages through the stable read cutoff", () => {
    const history = { pages: [{ items: [message, { ...message, id: "later", created_at: "2026-10-22T00:00:03.000Z" },
      { ...message, id: "reader-own", sender_id: "buyer" }], next_cursor: null }], pageParams: [null] };
    const merged = mergeReadReceipt(history, { conversation_id: "thread", reader_id: "buyer", last_message_id: message.id,
      read_at: "2026-10-22T00:00:04.000Z" })!;
    expect(merged.pages[0]!.items.map((item) => item.read_at)).toEqual(["2026-10-22T00:00:04.000Z", null, null]);
  });
  it("preserves older pages and cursors when a new message arrives", () => {
    const old = { ...message, id: "old", client_message_id: "old", created_at: "2026-10-22T00:00:01.000Z" };
    const history = { pages: [{ items: [old], next_cursor: "cursor" }, { items: [], next_cursor: null }], pageParams: [null, "cursor"] };
    const merged = mergeMessage(history, message)!;
    expect(merged.pages[0]!.items).toEqual([old, message]);
    expect(merged.pages[0]!.next_cursor).toBe("cursor");
    expect(merged.pages[1]).toBe(history.pages[1]);
    expect(history.pages[0]!.items).toEqual([old]);
    expect(merged.pageParams).toEqual([null, "cursor"]);
  });
  it("reconciles repeated socket/HTTP acknowledgements without clearing read receipts", () => {
    const history = { pages: [{ items: [{ ...message, read_at: message.created_at }], next_cursor: null }], pageParams: [null] };
    const merged = mergeMessage(mergeMessage(history, message), message)!;
    expect(merged).toBe(history);
    expect(merged.pages[0]!.items).toEqual([{ ...message, read_at: message.created_at }]);
    expect(mergeMessage(undefined, message)).toBeUndefined();
  });
  it("keeps untouched pages and skips duplicate receipt updates", () => {
    const unread = { ...message, id: "later", created_at: "2026-10-22T00:00:06.000Z" };
    const history = { pages: [{ items: [unread], next_cursor: "cursor" }, { items: [message], next_cursor: null }], pageParams: [null, "cursor"] };
    const receipt = { conversation_id: "thread", reader_id: "buyer", last_message_id: message.id, read_at: "2026-10-22T00:00:04.000Z" };
    const merged = mergeReadReceipt(history, receipt);
    expect(merged?.pages[0]).toBe(history.pages[0]);
    expect(merged?.pages[1]?.items[0]?.read_at).toBe(receipt.read_at);
    expect(mergeReadReceipt(merged, receipt)).toBe(merged);
  });
});
