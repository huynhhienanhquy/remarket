import { CHAT_LIMITS, validateChatMessage } from "@remarket/shared";
import type { ChatApi } from "../lib/api/contract";
import { currentViewer } from "./adapter-auth";
import { db } from "./store";
import {
  conflict,
  findProduct,
  forbidden,
  mustFindUser,
  notFound,
  requireActive,
  requireVerified,
  validationError,
} from "./adapter-helpers";
import type { MockConversation, MockMessage, MockUser } from "./types";

const PAGE_SIZE = 30;

function mustParticipate(conversation: MockConversation, viewer: MockUser): void {
  if (conversation.buyer_id !== viewer.id && conversation.seller_id !== viewer.id) {
    forbidden();
  }
}

function findConversation(id: string): MockConversation {
  const conversation = db().conversations.find((entry) => entry.id === id);
  if (!conversation) notFound("Không tìm thấy cuộc trò chuyện này.");
  return conversation;
}

export const chatApi: ChatApi = {
  async conversations(page) {
    const viewer = requireActive(currentViewer());
    const database = db();
    const pageNumber = Math.max(1, page ?? 1);

    const rows = database.conversations
      .filter(
        (conversation) =>
          conversation.buyer_id === viewer.id || conversation.seller_id === viewer.id,
      )
      .sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));

    const start = (pageNumber - 1) * 20;
    const slice = rows.slice(start, start + 20);

    return {
      items: slice.map((conversation) => {
        const otherId =
          conversation.buyer_id === viewer.id ? conversation.seller_id : conversation.buyer_id;
        const other = mustFindUser(database, otherId);
        const product = findProduct(database, conversation.product_id);
        const visible =
          product !== undefined &&
          product.deleted_at === null &&
          !product.is_blocked &&
          (product.seller_id === viewer.id ||
            ["ACTIVE", "RESERVED", "SOLD"].includes(product.status));

        const thread = database.messages
          .filter((message) => message.conversation_id === conversation.id)
          .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
        const last = thread[0];
        const unread = thread.filter(
          (message) => message.sender_id !== viewer.id && message.read_at === null,
        ).length;

        return {
          id: conversation.id,
          counterparty: {
            id: other.id,
            name: other.full_name,
            avatar_url: other.avatar_url,
          },
          product: visible && product
            ? {
                id: product.id,
                title: product.title,
                image_url: product.images[0]?.url ?? null,
                status: product.status,
                price: product.price,
              }
            : null,
          last_message: last
            ? {
                content: last.content,
                created_at: last.created_at,
                sender_id: last.sender_id,
              }
            : null,
          unread_count: unread,
          updated_at: conversation.updated_at,
        };
      }),
      meta: { total: rows.length },
    };
  },

  async open(productId) {
    const viewer = requireVerified(currentViewer());
    const database = db();
    const product = findProduct(database, productId);
    if (!product) notFound("Không tìm thấy món đồ này.");
    if (product.seller_id === viewer.id) {
      validationError("Không thể nhắn tin cho chính mình.");
    }

    const existing = database.conversations.find(
      (conversation) =>
        conversation.product_id === productId &&
        conversation.buyer_id === viewer.id &&
        conversation.seller_id === product.seller_id,
    );
    if (existing) return { id: existing.id };

    if (product.is_blocked || !["ACTIVE", "RESERVED", "SOLD"].includes(product.status)) {
      conflict("PRODUCT_NOT_AVAILABLE", "Tin đăng không còn khả dụng để nhắn tin.");
    }

    const id = `00000005-0000-4000-8000-${(database.conversations.length + 50).toString(16).padStart(12, "0")}`;
    const now = new Date().toISOString();
    database.conversations.push({
      id,
      product_id: productId,
      buyer_id: viewer.id,
      seller_id: product.seller_id,
      created_at: now,
      updated_at: now,
    });
    return { id };
  },

  async messages(conversationId, cursor) {
    const viewer = requireActive(currentViewer());
    const database = db();
    const conversation = findConversation(conversationId);
    mustParticipate(conversation, viewer);

    const all = database.messages
      .filter((message) => message.conversation_id === conversationId)
      .sort((a, b) => (a.created_at === b.created_at ? (a.id < b.id ? -1 : 1) : a.created_at < b.created_at ? -1 : 1));

    let older = all;
    if (cursor) {
      const index = all.findIndex((message) => message.id === cursor);
      older = index >= 0 ? all.slice(0, index) : all;
    }
    const items = older.slice(-PAGE_SIZE);
    const nextCursor =
      older.length > items.length && items.length > 0 ? (items[0]?.id ?? null) : null;

    return { items, next_cursor: nextCursor };
  },

  async send(conversationId, input) {
    const viewer = requireVerified(currentViewer());
    const database = db();
    const conversation = findConversation(conversationId);
    mustParticipate(conversation, viewer);
    if (viewer.status === "LOCKED") forbidden();

    const content = input.content.trim();
    const error = validateChatMessage(content);
    if (error) validationError(error, { content: error });
    if (content.length < CHAT_LIMITS.messageMin) {
      validationError("Tin nhắn không được để trống.", { content: "Bắt buộc." });
    }

    // Idempotent by client id: a retried send never duplicates a message.
    const duplicate = database.messages.find(
      (message) =>
        message.conversation_id === conversationId &&
        message.sender_id === viewer.id &&
        message.client_message_id === input.client_message_id,
    );
    if (duplicate) return { message: duplicate };

    const product = findProduct(database, conversation.product_id);
    if (product && (product.is_blocked || product.deleted_at !== null)) {
      conflict("PRODUCT_NOT_AVAILABLE", "Tin đăng không còn khả dụng nên không thể nhắn tin mới.");
    }

    const message: MockMessage = {
      id: `00000006-0000-4000-8000-${(database.messages.length + 600).toString(16).padStart(12, "0")}`,
      conversation_id: conversationId,
      sender_id: viewer.id,
      client_message_id: input.client_message_id,
      content,
      read_at: null,
      created_at: new Date().toISOString(),
    };
    database.messages.push(message);
    conversation.updated_at = message.created_at;
    return { message };
  },

  async markRead(conversationId, lastMessageId) {
    const viewer = requireActive(currentViewer());
    const database = db();
    const conversation = findConversation(conversationId);
    mustParticipate(conversation, viewer);

    const last = database.messages.find(
      (message) => message.id === lastMessageId && message.conversation_id === conversationId,
    );
    if (!last) notFound("Không tìm thấy tin nhắn này.");
    if (last.sender_id === viewer.id) {
      // Reading your own message marks nothing; keep the response idempotent.
      return { read_at: last.read_at ?? new Date().toISOString() };
    }

    const now = new Date().toISOString();
    for (const message of database.messages) {
      if (
        message.conversation_id === conversationId &&
        message.sender_id !== viewer.id &&
        message.read_at === null &&
        message.created_at <= last.created_at
      ) {
        message.read_at = now;
      }
    }
    return { read_at: now };
  },
};
