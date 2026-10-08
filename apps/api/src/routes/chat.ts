import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import type { ConversationListItem, MessagePage } from "@remarket/shared";
import { prisma } from "../utils/prisma.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { requireActive, requireVerified } from "../middleware/auth.js";
import type { AuthRequest, AuthUser } from "../middleware/auth.js";
import { ok, okList } from "../shared/api-response.js";
import { DEFAULT_PAGE_SIZE, offsetOf, pageMeta } from "../shared/pagination.js";
import {
  accountLocked,
  emailNotVerified,
  notFound,
  productNotAvailable,
  unauthorized,
  validationError,
} from "../shared/errors.js";
import { toConversationListItem, toMessage } from "../shared/dto-mappers.js";
import { markConversationRead, sendChatMessage } from "../services/chat-service.js";
import { chatRateLimit } from "../middleware/rate-limit.js";

/**
 * Conversations and messages (detail-project 13).
 *
 * Membership is the only authorization: every read and write is scoped to the
 * two participants inside the same query. Sending additionally needs an
 * ACTIVE + verified account; a LOCKED user cannot access the inbox.
 */

const router = Router();
router.use(requireActive);

const DEFAULT_MESSAGE_PAGE_SIZE = 30;
const MAX_MESSAGE_PAGE_SIZE = 100;

/* ------------------------------------------------------------------ *
 * Input
 * ------------------------------------------------------------------ */

const conversationListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).optional(),
    page_size: z.coerce.number().int().min(1).max(100).optional(),
  })
  .strict();

const openConversationSchema = z
  .object({ product_id: z.string().uuid("Mã sản phẩm không hợp lệ.") })
  .strict();

const messagePageQuerySchema = z
  .object({
    cursor: z.string().min(1, "Con trỏ phân trang không hợp lệ.").max(1024).optional(),
    page_size: z.coerce.number().int().min(1).max(MAX_MESSAGE_PAGE_SIZE).optional(),
  })
  .strict();

const sendMessageSchema = z
  .object({
    client_message_id: z
      .string()
      .trim()
      .min(1, "Mã tin nhắn không hợp lệ.")
      .max(100, "Mã tin nhắn tối đa 100 ký tự."),
    content: z.string().trim().min(1, "Tin nhắn không được để trống."),
  })
  .strict();

const markReadSchema = z
  .object({ last_message_id: z.string().uuid("Mã tin nhắn không hợp lệ.") })
  .strict();

/* ------------------------------------------------------------------ *
 * Shared helpers
 * ------------------------------------------------------------------ */

const conversationInclude = {
  buyer: true,
  seller: true,
  product: { include: { images: { orderBy: { sortOrder: "asc" } } } },
  messages: {
    take: 1,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { content: true, createdAt: true, senderId: true },
  },
} satisfies Prisma.ConversationInclude;

type ConversationRecord = Prisma.ConversationGetPayload<{ include: typeof conversationInclude }>;
type ConversationRow = ConversationRecord & { _count: { messages: number } };

function viewerOf(req: AuthRequest): AuthUser {
  if (!req.user) throw unauthorized();
  return req.user;
}

function parseId(raw: string | undefined): string {
  const parsed = z.string().uuid().safeParse(raw ?? "");
  if (!parsed.success) throw notFound("Không tìm thấy cuộc hội thoại này.");
  return parsed.data;
}

/** Only the two participants see a thread; everyone else gets 404 (17). */
async function mustParticipate(
  conversationId: string,
  viewerId: string,
): Promise<{ buyerId: string; sellerId: string }> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { buyerId: true, sellerId: true },
  });
  if (
    !conversation ||
    (conversation.buyerId !== viewerId && conversation.sellerId !== viewerId)
  ) {
    throw notFound("Không tìm thấy cuộc hội thoại này.");
  }
  return conversation;
}

function mapConversation(row: ConversationRow, viewerId: string): ConversationListItem {
  const product = row.product;
  const visible =
    product !== null &&
    product.deletedAt === null &&
    !product.isBlocked &&
    (product.sellerId === viewerId ||
      product.status === "ACTIVE" ||
      product.status === "RESERVED" ||
      product.status === "SOLD");

  const item = toConversationListItem(
    {
      id: row.id,
      updatedAt: row.updatedAt,
      buyerId: row.buyerId,
      sellerId: row.sellerId,
      buyer: row.buyer,
      seller: row.seller,
      product: visible ? product : null,
      messages: row.messages,
    },
    viewerId,
    row._count.messages,
  );
  const canSend = product === null || (!product.isBlocked && product.deletedAt === null);
  return { ...item, can_send: canSend, unavailable_reason: canSend ? null : "Tin đăng không còn khả dụng nên không thể nhắn tin mới." };
}

async function conversationItem(
  conversationId: string,
  viewerId: string,
): Promise<ConversationListItem> {
  const row = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      ...conversationInclude,
      _count: {
        select: { messages: { where: { readAt: null, senderId: { not: viewerId } } } },
      },
    },
  });
  if (!row) throw notFound("Không tìm thấy cuộc hội thoại này.");
  return mapConversation(row, viewerId);
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/* ------------------------------------------------------------------ *
 * Opaque cursor: base64url of { createdAt, id } (detail-project 13)
 * ------------------------------------------------------------------ */

interface MessageCursor {
  createdAt: Date;
  id: string;
}

function encodeCursor(row: MessageCursor): string {
  const payload = JSON.stringify({ createdAt: row.createdAt.toISOString(), id: row.id });
  return Buffer.from(payload, "utf8").toString("base64url");
}

function decodeCursor(raw: string): MessageCursor {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (typeof parsed === "object" && parsed !== null) {
      const candidate = parsed as { createdAt?: unknown; id?: unknown };
      if (typeof candidate.createdAt === "string" && typeof candidate.id === "string") {
        const createdAt = new Date(candidate.createdAt);
        if (!Number.isNaN(createdAt.getTime())) {
          return { createdAt, id: candidate.id };
        }
      }
    }
  } catch {
    /* fall through to the validation error */
  }
  throw validationError("Con trỏ phân trang không hợp lệ.", { cursor: "Không hợp lệ." });
}

/* ------------------------------------------------------------------ *
 * GET /api/v1/conversations
 * ------------------------------------------------------------------ */

router.get(
  "/",
  asyncHandler(async (req: AuthRequest, res) => {
    const viewer = viewerOf(req);
    const query = conversationListQuerySchema.parse(req.query);
    const paging = {
      page: query.page ?? 1,
      page_size: query.page_size ?? DEFAULT_PAGE_SIZE,
    };

    const where: Prisma.ConversationWhereInput = {
      OR: [{ buyerId: viewer.id }, { sellerId: viewer.id }],
    };

    const [conversations, total] = await Promise.all([
      prisma.conversation.findMany({
        where,
        include: {
          ...conversationInclude,
          _count: {
            select: { messages: { where: { readAt: null, senderId: { not: viewer.id } } } },
          },
        },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        skip: offsetOf(paging),
        take: paging.page_size,
      }),
      prisma.conversation.count({ where }),
    ]);

    okList(
      res,
      conversations.map((row) => mapConversation(row, viewer.id)),
      pageMeta(paging, total),
    );
  }),
);

/* ------------------------------------------------------------------ *
 * POST /api/v1/conversations — open (or reuse) the product thread
 * ------------------------------------------------------------------ */

router.post(
  "/",
  requireVerified,
  asyncHandler(async (req: AuthRequest, res) => {
    const viewer = viewerOf(req);
    const { product_id } = openConversationSchema.parse(req.body);

    const product = await prisma.product.findUnique({
      where: { id: product_id },
      select: { id: true, sellerId: true },
    });
    if (!product) throw notFound("Không tìm thấy món đồ này.");
    if (product.sellerId === viewer.id) {
      throw validationError("Không thể nhắn tin cho chính mình.", {
        product_id: "Bạn không thể nhắn tin cho chính mình.",
      });
    }

    /* Unique (buyerId, sellerId, productId): never create a duplicate thread. */
    const uniqueKey = {
      buyerId_sellerId_productId: {
        buyerId: viewer.id,
        sellerId: product.sellerId,
        productId: product.id,
      },
    };
    const existing = await prisma.conversation.findUnique({ where: uniqueKey });
    if (existing) {
      ok(res, await conversationItem(existing.id, viewer.id));
      return;
    }

    let result: { id: string; created: boolean };
    try {
      result = await prisma.$transaction(async (tx) => {
        // Serialize eligibility with account locking, product blocking and
        // category deactivation. Locks are acquired in a stable order.
        const participantIds = [viewer.id, product.sellerId].sort();
        await tx.$queryRaw(
          Prisma.sql`SELECT "id" FROM "User" WHERE "id" IN (${Prisma.join(participantIds)}) ORDER BY "id" FOR SHARE`,
        );
        await tx.$queryRaw`SELECT "id" FROM "Product" WHERE "id" = ${product.id} FOR SHARE`;

        const current = await tx.product.findUnique({ where: { id: product.id } });
        if (!current) throw notFound("Không tìm thấy món đồ này.");
        const users = await tx.user.findMany({
          where: { id: { in: participantIds } },
          select: { id: true, status: true, emailVerifiedAt: true },
        });
        const usersById = new Map(users.map((user) => [user.id, user]));
        const buyer = usersById.get(viewer.id);
        const seller = usersById.get(current.sellerId);
        if (!buyer || buyer.status !== "ACTIVE") throw accountLocked();
        if (buyer.emailVerifiedAt === null) throw emailNotVerified();

        const categoryRows = await tx.$queryRaw<Array<{ id: string }>>`
          WITH RECURSIVE chain AS (
            SELECT "id", "parentId" FROM "Category" WHERE "id" = ${current.categoryId}
            UNION
            SELECT parent."id", parent."parentId"
            FROM "Category" parent
            JOIN chain child ON parent."id" = child."parentId"
          )
          SELECT category."id"
          FROM "Category" category
          WHERE category."id" IN (SELECT "id" FROM chain)
          ORDER BY category."id"
          FOR SHARE
        `;
        const categories = await tx.category.findMany({
          where: { id: { in: categoryRows.map((row) => row.id) } },
          select: { id: true, parentId: true, status: true },
        });
        const categoryById = new Map(categories.map((category) => [category.id, category]));
        let category = categoryById.get(current.categoryId);
        let categoryActive = category !== undefined;
        const visited = new Set<string>();
        while (category) {
          if (visited.has(category.id) || category.status !== "ACTIVE") {
            categoryActive = false;
            break;
          }
          visited.add(category.id);
          if (!category.parentId) break;
          category = categoryById.get(category.parentId);
          if (!category) categoryActive = false;
        }
        const isLeaf =
          (await tx.category.count({ where: { parentId: current.categoryId } })) === 0;

        if (
          current.status !== "ACTIVE" ||
          current.isBlocked ||
          current.deletedAt !== null ||
          !seller ||
          seller.status !== "ACTIVE" ||
          seller.emailVerifiedAt === null ||
          !categoryActive ||
          !isLeaf
        ) {
          throw productNotAvailable("Tin đăng không còn khả dụng để nhắn tin.");
        }

        const raced = await tx.conversation.findUnique({ where: { buyerId_sellerId_productId: uniqueKey.buyerId_sellerId_productId } });
        if (raced) return { id: raced.id, created: false };
        const created = await tx.conversation.create({
          data: { productId: current.id, buyerId: viewer.id, sellerId: current.sellerId },
        });
        return { id: created.id, created: true };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (isUniqueViolation(error)) {
        const raced = await prisma.conversation.findUnique({ where: uniqueKey });
        if (raced) {
          ok(res, await conversationItem(raced.id, viewer.id));
          return;
        }
      }
      throw error;
    }

    ok(res, await conversationItem(result.id, viewer.id), result.created ? 201 : 200);
  }),
);

/* ------------------------------------------------------------------ *
 * GET /api/v1/conversations/:conversationId/messages
 * ------------------------------------------------------------------ */

router.get("/:conversationId", asyncHandler(async (req: AuthRequest, res) => {
  const viewer = viewerOf(req);
  const id = parseId(req.params.conversationId);
  await mustParticipate(id, viewer.id);
  ok(res, await conversationItem(id, viewer.id));
}));

router.get(
  "/:conversationId/messages",
  asyncHandler(async (req: AuthRequest, res) => {
    const viewer = viewerOf(req);
    const conversationId = parseId(req.params.conversationId);
    await mustParticipate(conversationId, viewer.id);

    const query = messagePageQuerySchema.parse(req.query);
    const limit = query.page_size ?? DEFAULT_MESSAGE_PAGE_SIZE;
    const cursor = query.cursor ? decodeCursor(query.cursor) : null;

    /* Strictly older than the cursor, stable on (createdAt, id), newest first. */
    const rows = await prisma.message.findMany({
      where: {
        conversationId,
        ...(cursor
          ? {
              OR: [
                { createdAt: { lt: cursor.createdAt } },
                { createdAt: cursor.createdAt, id: { lt: cursor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    page.reverse();

    const oldest = page[0];
    const nextCursor = hasMore && oldest ? encodeCursor(oldest) : null;
    const data: MessagePage = {
      items: page.map((message) => toMessage(message)),
      next_cursor: nextCursor,
    };
    ok(res, data);
  }),
);

/* ------------------------------------------------------------------ *
 * POST /api/v1/conversations/:conversationId/messages
 * ------------------------------------------------------------------ */

router.post(
  "/:conversationId/messages",
  chatRateLimit,
  requireVerified,
  asyncHandler(async (req: AuthRequest, res) => {
    const viewer = viewerOf(req);
    const conversationId = parseId(req.params.conversationId);
    const input = sendMessageSchema.parse(req.body);
    const result = await sendChatMessage({
      conversationId,
      viewer,
      clientMessageId: input.client_message_id,
      content: input.content,
    });
    ok(res, { message: toMessage(result.message) }, result.created ? 201 : 200);
  }),
);

/* ------------------------------------------------------------------ *
 * POST /api/v1/conversations/:conversationId/read
 * ------------------------------------------------------------------ */

router.post(
  "/:conversationId/read",
  asyncHandler(async (req: AuthRequest, res) => {
    const viewer = viewerOf(req);
    const conversationId = parseId(req.params.conversationId);
    const { last_message_id } = markReadSchema.parse(req.body);
    ok(
      res,
      await markConversationRead({
        conversationId,
        viewerId: viewer.id,
        lastMessageId: last_message_id,
      }),
    );
  }),
);

export { router as chatRouter };
