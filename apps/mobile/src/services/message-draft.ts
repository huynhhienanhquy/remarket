import { ApiError } from "@remarket/api-client";
import { validateChatMessage } from "@remarket/shared";

export function messageDraftError(content: string): string | null {
  if (!content.trim()) return "Vui lòng nhập tin nhắn.";
  return validateChatMessage(content);
}

/** Only uncertain outcomes need to retain the original idempotency key. */
export function canRetryMessage(error: unknown): boolean {
  return !(error instanceof ApiError) || error.status === 0 || error.status >= 500;
}
