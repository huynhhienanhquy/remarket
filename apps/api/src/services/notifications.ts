import type { Prisma } from "@prisma/client";
import { enqueueOutboxBatch } from "../outbox/outbox.js";

/** The notification row and its durable delivery event commit together. */
export async function createNotifications(
  tx: Prisma.TransactionClient,
  input: Prisma.NotificationCreateManyArgs,
): Promise<{ count: number }> {
  const rows = await tx.notification.createManyAndReturn({
    ...input,
    select: { id: true, userId: true, referenceType: true, referenceId: true },
  });
  if (rows.length) await enqueueOutboxBatch(tx, rows.map((row) => ({
      eventType: "notification.created",
      aggregateId: row.id,
      dedupeKey: `notification:${row.id}`,
      payload: {
        notification_id: row.id,
        recipients: [row.userId],
        reference_type: row.referenceType,
        reference_id: row.referenceId,
      },
    })));
  return { count: rows.length };
}

export async function createNotification(
  tx: Prisma.TransactionClient,
  input: Prisma.NotificationCreateArgs,
) {
  const row = await tx.notification.create(input);
  await enqueueOutboxBatch(tx, [{
      eventType: "notification.created",
      aggregateId: row.id,
      dedupeKey: `notification:${row.id}`,
      payload: { notification_id: row.id, recipients: [row.userId], reference_type: row.referenceType, reference_id: row.referenceId },
    }]);
  return row;
}
