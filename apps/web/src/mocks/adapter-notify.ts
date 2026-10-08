import type { NotificationType } from "@remarket/shared";
import type { Database } from "./types";

/**
 * Durable in-app notification (detail-project 11.3). The mock writes straight
 * to the store; a real backend would write in the same transaction and let the
 * outbox deliver it.
 */
export function notify(
  database: Database,
  userId: string,
  input: {
    type: NotificationType;
    title: string;
    content: string;
    reference_type: string;
    reference_id: string | null;
  },
): void {
  const dedupeKey = `${input.type}:${input.reference_id ?? "none"}:${userId}`;
  const exists = database.notifications.some(
    (entry) =>
      entry.user_id === userId &&
      entry.type === input.type &&
      entry.reference_id === input.reference_id,
  );
  if (exists) return;

  database.notifications.unshift({
    id: `0000000a-0000-4000-8000-${(database.notifications.length + 500).toString(16).padStart(12, "0")}`,
    user_id: userId,
    type: input.type,
    title: input.title,
    content: input.content,
    reference_type: input.reference_type,
    reference_id: input.reference_id,
    read_at: null,
    created_at: new Date().toISOString(),
    dedupe_key: dedupeKey,
  });
}
