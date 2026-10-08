import type { Prisma, SupportTicket } from "@prisma/client";

/**
 * Lock an order-linked support ticket in the same global order used by order
 * transitions: Order first, then SupportTicket. This makes reopening/resolving
 * a blocking ticket linearizable with DELIVERED -> COMPLETED and avoids the
 * ticket/order deadlock inversion called out in the backend specification.
 */
export async function lockSupportTicketWithOrder(
  tx: Prisma.TransactionClient,
  ticketId: string,
): Promise<SupportTicket | null> {
  const link = await tx.supportTicket.findUnique({
    where: { id: ticketId },
    select: { orderId: true },
  });
  if (link === null) return null;

  if (link.orderId !== null) {
    await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${link.orderId} FOR UPDATE`;
  }
  await tx.$queryRaw`SELECT "id" FROM "SupportTicket" WHERE "id" = ${ticketId} FOR UPDATE`;
  return tx.supportTicket.findUnique({ where: { id: ticketId } });
}
