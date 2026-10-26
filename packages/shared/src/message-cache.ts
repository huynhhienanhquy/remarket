import type { Message, MessagePage } from "./dto.js";

export interface MessageHistory {
  pages: MessagePage[];
  pageParams: (string | null)[];
}

/** Keep older-page cursors intact and reconcile HTTP/socket retries by identity. */
export function mergeMessage(history: MessageHistory | undefined, message: Message): MessageHistory | undefined {
  if (!history?.pages.length) return history;
  let matched = false;
  const pages = history.pages.map((page) => ({ ...page, items: page.items.map((item) => {
    if (item.id !== message.id && (item.sender_id !== message.sender_id || item.client_message_id !== message.client_message_id)) return item;
    matched = true;
    return { ...message, read_at: message.read_at ?? item.read_at };
  }) }));
  if (!matched) pages[0] = { ...pages[0]!, items: [...pages[0]!.items, message].sort((a, b) =>
    a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)) };
  return { ...history, pages };
}

export interface ConversationReadEvent {
  conversation_id: string;
  reader_id: string;
  last_message_id: string;
  read_at: string;
}

export function mergeReadReceipt(history: MessageHistory | undefined, event: ConversationReadEvent): MessageHistory | undefined {
  const target = history?.pages.flatMap((page) => page.items).find((item) => item.id === event.last_message_id);
  if (!history || !target) return history;
  return { ...history, pages: history.pages.map((page) => ({ ...page, items: page.items.map((item) =>
    item.sender_id !== event.reader_id && !item.read_at &&
      (item.created_at < target.created_at || (item.created_at === target.created_at && item.id <= target.id))
      ? { ...item, read_at: event.read_at } : item) })) };
}
