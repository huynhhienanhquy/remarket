import type { Message, MessagePage } from "./dto.js";

export interface MessageHistory {
  pages: MessagePage[];
  pageParams: (string | null)[];
}

function updateMessages(history: MessageHistory, update: (message: Message) => Message): MessageHistory {
  let pages: MessagePage[] | undefined;
  history.pages.forEach((page, pageIndex) => {
    let items: Message[] | undefined;
    page.items.forEach((item, index) => {
      const next = update(item);
      if (next === item) return;
      items ??= page.items.slice();
      items[index] = next;
    });
    if (items) {
      pages ??= history.pages.slice();
      pages[pageIndex] = { ...page, items };
    }
  });
  return pages ? { ...history, pages } : history;
}

/** Keep older-page cursors intact and reconcile HTTP/socket retries by identity. */
export function mergeMessage(history: MessageHistory | undefined, message: Message): MessageHistory | undefined {
  const firstPage = history?.pages[0];
  if (!history || !firstPage) return history;
  let matched = false;
  const updated = updateMessages(history, (item) => {
    if (item.id !== message.id && (item.sender_id !== message.sender_id || item.client_message_id !== message.client_message_id)) return item;
    matched = true;
    const readAt = message.read_at ?? item.read_at;
    if (item.id === message.id && item.sender_id === message.sender_id && item.client_message_id === message.client_message_id &&
        item.content === message.content && item.created_at === message.created_at && item.read_at === readAt &&
        item.is_system === message.is_system) return item;
    return { ...message, read_at: readAt };
  });
  if (matched) return updated;
  const items = [...firstPage.items, message].sort((a, b) =>
    a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
  return { ...history, pages: [{ ...firstPage, items }, ...history.pages.slice(1)] };
}

export interface ConversationReadEvent {
  conversation_id: string;
  reader_id: string;
  last_message_id: string;
  read_at: string;
}

export function mergeReadReceipt(history: MessageHistory | undefined, event: ConversationReadEvent): MessageHistory | undefined {
  if (!history) return history;
  for (const page of history.pages) {
    const target = page.items.find((item) => item.id === event.last_message_id);
    if (!target) continue;
    return updateMessages(history, (item) => item.sender_id !== event.reader_id && !item.read_at &&
      (item.created_at < target.created_at || (item.created_at === target.created_at && item.id <= target.id))
      ? { ...item, read_at: event.read_at } : item);
  }
  return history;
}
