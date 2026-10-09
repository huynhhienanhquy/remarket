import type {
  Prisma,
  Category,
  Order,
  OrderDeliveryInfo,
  OrderItem,
  OrderStatusHistory,
  Product,
  ProductImage,
  Report,
  Review,
  SupportMessage,
  SupportTicket,
  User,
} from "@prisma/client";
import type {
  AdminProductItem,
  AdminReportItem,
  AdminReviewItem,
  AdminSupportOrderSummary,
  AdminSupportTicketDetail,
  AdminSupportTicketItem,
  AdminUserItem,
  AuditLogItem,
  CategoryNode,
  ConversationListItem,
  Notification as NotificationDto,
  OrderAction,
  OrderDetail,
  OrderDeliveryInfo as OrderDeliveryDto,
  OrderListItem,
  OrderReviewState,
  OrderStatusHistoryEntry,
  OwnProduct,
  ProductAction,
  ProductCapabilities,
  ProductDetail,
  ProductImage as ProductImageDto,
  ProductListItem,
  PublicProfile,
  ReportRecord,
  Review as ReviewDto,
  SellerSummary,
  SessionUser,
  SupportAction,
  SupportMessage as SupportMessageDto,
  SupportTicketDetail,
  SupportTicketListItem,
} from "@remarket/shared";
import { createPrivateStorageUrl, createPublicStorageUrl } from "../services/storage.js";
import { usableImageUrl } from "./image-url.js";
import { REVIEW_LIMITS, provinceLabel } from "@remarket/shared";
import type { SellerAggregates } from "./seller-aggregates.js";

/**
 * DTO mappers (detail-project 8). This is the only place a Prisma row may be
 * turned into a response — routes never spread a model, so `passwordHash`,
 * refresh hashes and PII cannot leak by accident.
 *
 * Rules: money via `.toString()`, dates always ISO 8601, `SellerSummary.name`
 * comes from `User.fullName`, `province_label` from the shared versioned
 * geography dataset.
 */

export function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

export function isoRequired(value: Date): string {
  return value.toISOString();
}

/* ------------------------------------------------------------------ *
 * Users
 * ------------------------------------------------------------------ */

export type SessionProfile = Pick<User, "id" | "fullName" | "email" | "avatarUrl" | "role" | "status" | "emailVerifiedAt" | "phone" | "provinceCode" | "defaultAddress" | "joinedAt">;

export const sessionProfileSelect = {
  id: true, fullName: true, email: true, avatarUrl: true, role: true, status: true,
  emailVerifiedAt: true, phone: true, provinceCode: true, defaultAddress: true, joinedAt: true,
} satisfies Prisma.UserSelect;

export function toSessionUser(user: SessionProfile): SessionUser {
  return {
    id: user.id,
    full_name: user.fullName,
    email: user.email,
    avatar_url: avatarReadUrl(user, false),
    role: user.role,
    status: user.status,
    email_verified_at: iso(user.emailVerifiedAt),
    phone: user.phone,
    province_code: user.provinceCode,
    default_address: user.defaultAddress,
    joined_at: isoRequired(user.joinedAt),
  };
}

export function toPublicProfile(user: User, aggregates: SellerAggregates): PublicProfile {
  return { seller: toSellerSummary(user, aggregates) };
}

export type SellerProfile = Pick<User, "id" | "fullName" | "avatarUrl" | "provinceCode" | "joinedAt" | "status" | "emailVerifiedAt">;

function avatarReadUrl(user: Pick<User, "id" | "avatarUrl" | "status" | "emailVerifiedAt">, publicRead = true): string | null {
  const url = usableImageUrl(user.avatarUrl);
  if (!url || (publicRead && (user.status !== "ACTIVE" || user.emailVerifiedAt === null))) return null;
  const match = /^\/api\/v1\/uploads\/([A-Za-z0-9][A-Za-z0-9._-]*)$/.exec(url);
  if (!match || match[1]!.includes("..")) return url;
  const storagePath = `users/${user.id}/avatar/${match[1]}`;
  return publicRead ? createPublicStorageUrl(storagePath) : createPrivateStorageUrl(storagePath);
}

export function toSellerSummary(user: SellerProfile, aggregates: SellerAggregates): SellerSummary {
  return {
    id: user.id,
    name: user.fullName,
    avatar_url: avatarReadUrl(user),
    province_code: user.provinceCode,
    province_label: provinceLabel(user.provinceCode),
    joined_at: isoRequired(user.joinedAt),
    rating: aggregates.rating,
    review_count: aggregates.review_count,
    completed_sales_count: aggregates.completed_sales_count,
  };
}

export function toAdminUserItem(user: User): AdminUserItem {
  return {
    id: user.id,
    full_name: user.fullName,
    email: user.email,
    avatar_url: avatarReadUrl(user, false),
    phone: user.phone,
    province_code: user.provinceCode,
    province_label: provinceLabel(user.provinceCode),
    default_address: user.defaultAddress,
    email_verified_at: iso(user.emailVerifiedAt),
    role: user.role,
    status: user.status,
    created_at: isoRequired(user.joinedAt),
    lock_reason: user.lockReason,
    locked_at: iso(user.lockedAt),
  };
}

/* ------------------------------------------------------------------ *
 * Categories
 * ------------------------------------------------------------------ */

export interface CategoryRow extends Category {
  children?: CategoryRow[];
}

export function toCategoryNode(category: CategoryRow): CategoryNode {
  const node: CategoryNode = {
    id: category.id,
    parent_id: category.parentId,
    name: category.name,
    slug: category.slug,
    status: category.status,
  };
  if (category.children && category.children.length > 0) {
    node.children = category.children.map(toCategoryNode);
  }
  return node;
}

/* ------------------------------------------------------------------ *
 * Products
 * ------------------------------------------------------------------ */

export type ProductRow = Product & {
  images: ProductImage[];
  seller: User;
};

export type ProductListRow = Pick<Product,
  "id" | "sellerId" | "title" | "price" | "condition" | "provinceCode" |
  "publishedAt" | "createdAt" | "status" | "isBlocked" | "deletedAt"
> & {
  images: Pick<ProductImage, "url" | "storagePath" | "sortOrder">[];
  seller: SellerProfile;
};

export interface ViewerContext {
  viewerId: string | null;
  viewerRole: "USER" | "ADMIN" | null;
  viewerStatus: "ACTIVE" | "LOCKED" | null;
  viewerEmailVerified: boolean;
  /** Product ids the viewer has favourished, preloaded for the whole batch. */
  favorited: ReadonlySet<string>;
  /** Seller aggregates keyed by seller id, preloaded for the whole batch. */
  aggregates: ReadonlyMap<string, SellerAggregates>;
}

export const ANONYMOUS_VIEWER: ViewerContext = {
  viewerId: null,
  viewerRole: null,
  viewerStatus: null,
  viewerEmailVerified: false,
  favorited: new Set(),
  aggregates: new Map(),
};

function sortedImages(product: ProductRow, includeStoragePath = false): ProductImageDto[] {
  return [...product.images]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .flatMap((image) => {
      const url = image.storagePath
        ? includeStoragePath ? createPrivateStorageUrl(image.storagePath) : createPublicStorageUrl(image.storagePath)
        : usableImageUrl(image.url);
      return url === null ? [] : [{
        id: image.id,
        url,
        ...(includeStoragePath && image.storagePath ? { storage_path: image.storagePath } : {}),
        sort_order: image.sortOrder,
      }];
    });
}

function firstImageUrl<T extends Pick<ProductListRow, "images">>(product: T, privatePreview = false, publicVisibilityChecked = true): string | null {
  const images = [...product.images].sort((a, b) => a.sortOrder - b.sortOrder);
  for (const image of images) {
    if (image.storagePath && (privatePreview || publicVisibilityChecked)) return privatePreview ? createPrivateStorageUrl(image.storagePath) : createPublicStorageUrl(image.storagePath);
    const url = usableImageUrl(image.url);
    if (url) return url;
  }
  return null;
}

export function isOwnerOrAdmin(product: Pick<Product, "sellerId">, ctx: ViewerContext): boolean {
  if (ctx.viewerId === null) return false;
  return ctx.viewerId === product.sellerId || ctx.viewerRole === "ADMIN";
}

export function toProductListItem(product: ProductListRow, ctx: ViewerContext, publicVisibilityChecked = true): ProductListItem {
  const privileged = isOwnerOrAdmin(product, ctx);
  const item: ProductListItem = {
    id: product.id,
    title: product.title,
    price: product.price.toString(),
    image_url: firstImageUrl(product, privileged, publicVisibilityChecked),
    condition: product.condition,
    province_code: product.provinceCode,
    province_label: provinceLabel(product.provinceCode),
    published_at: iso(product.publishedAt),
    created_at: isoRequired(product.createdAt),
    status: product.status,
    is_favorited: ctx.viewerId !== null && ctx.favorited.has(product.id),
    seller: toSellerSummary(
      product.seller,
      ctx.aggregates.get(product.sellerId) ?? { rating: null, review_count: 0, completed_sales_count: 0 },
    ),
  };
  if (privileged) {
    item.is_blocked = product.isBlocked;
    item.is_hidden = product.isBlocked || product.deletedAt !== null;
  }
  return item;
}

/**
 * Private saved-item views retain an unavailable row so the owner can remove
 * it, while suppressing listing content after a block or soft delete.
 */
export function toSavedProductListItem(
  product: ProductRow,
  ctx: ViewerContext,
): ProductListItem {
  // Saved rows can remain after category/seller visibility changes. Without
  // a fresh public eligibility check, retain legacy DB-authorized image reads.
  const item = toProductListItem(product, ctx, false);
  const hidden = product.isBlocked || product.deletedAt !== null;
  return {
    ...item,
    title: hidden ? "" : item.title,
    price: hidden ? "0" : item.price,
    image_url: hidden ? null : item.image_url,
    is_blocked: product.isBlocked,
    is_hidden: hidden,
  };
}

/**
 * Viewer-dependent capabilities (ui-spec 12/17). The same policy backs the
 * mutation service, which re-checks authorization on every write.
 */
export function productCapabilities(
  product: ProductRow,
  ctx: ViewerContext,
  categoryActive: boolean,
): ProductCapabilities {
  const isOwner = ctx.viewerId !== null && ctx.viewerId === product.sellerId;
  const base: ProductCapabilities = {
    can_buy: false,
    can_add_to_cart: false,
    can_chat: false,
    can_favorite: ctx.viewerId !== null && !isOwner,
    can_report: ctx.viewerId !== null && !isOwner,
    can_edit: false,
    can_manage: false,
    unavailable_reason: null,
  };

  if (isOwner) {
    const editable = ["PENDING", "REJECTED", "INACTIVE", "ACTIVE"].includes(product.status);
    return {
      ...base,
      can_favorite: false,
      can_report: false,
      can_edit: editable && !product.isBlocked && product.deletedAt === null,
      can_manage: true,
      unavailable_reason: editable ? null : "Tin đang được giữ hoặc đã bán, chỉ xem được.",
    };
  }

  if (ctx.viewerStatus === "LOCKED") {
    return { ...base, unavailable_reason: "Tài khoản đang bị hạn chế." };
  }
  if (ctx.viewerId !== null && !ctx.viewerEmailVerified) {
    return { ...base, unavailable_reason: "Xác minh email để mua hàng và nhắn tin." };
  }
  if (product.deletedAt !== null || product.isBlocked) {
    return { ...base, unavailable_reason: "Tin đăng không còn khả dụng." };
  }
  if (product.status === "RESERVED") {
    return { ...base, unavailable_reason: "Sản phẩm đang được giữ cho một giao dịch." };
  }
  if (product.status !== "ACTIVE") {
    return { ...base, unavailable_reason: "Sản phẩm không khả dụng để mua." };
  }
  if (!categoryActive) {
    return { ...base, unavailable_reason: "Danh mục sản phẩm không còn hoạt động." };
  }

  return { ...base, can_buy: true, can_add_to_cart: true, can_chat: true, unavailable_reason: null };
}

export function toProductDetail(
  product: ProductRow,
  ctx: ViewerContext,
  categoryPath: string[],
  categoryActive: boolean,
): ProductDetail {
  const privileged = isOwnerOrAdmin(product, ctx);
  return {
    ...toProductListItem(product, ctx),
    description: product.description,
    images: sortedImages(product, privileged),
    category_id: product.categoryId,
    category_path: categoryPath,
    usage_months: product.usageMonths,
    delivery_method: product.deliveryMethod,
    shipping_fee: product.shippingFee.toString(),
    version: product.version,
    is_blocked: privileged ? product.isBlocked : false,
    block_reason: privileged ? product.blockReason : null,
    rejection_reason: privileged ? product.rejectionReason : null,
    capabilities: productCapabilities(product, ctx, categoryActive),
  };
}

/** Owner-only action list (ui-spec 13 table). */
export function ownProductActions(product: Product): ProductAction[] {
  if (product.isBlocked || product.deletedAt !== null) return ["view"];
  if (product.status === "RESERVED" || product.status === "SOLD") return ["view"];
  const actions: ProductAction[] = ["view", "edit", "hide", "delete"];
  if (product.status === "REJECTED" || product.status === "INACTIVE") actions.push("submit");
  return actions;
}

export function toOwnProduct(
  product: ProductRow,
  ctx: ViewerContext,
  categoryPath: string[],
  categoryActive: boolean,
): OwnProduct {
  return {
    ...toProductDetail(product, ctx, categoryPath, categoryActive),
    allowed_actions: ownProductActions(product),
  };
}

export function toAdminProductItem(
  product: ProductRow,
  categoryName: string,
): AdminProductItem {
  const aggregates = { rating: null, review_count: 0, completed_sales_count: 0 } as SellerAggregates;
  return {
    id: product.id,
    title: product.title,
    price: product.price.toString(),
    image_url: firstImageUrl(product, true),
    status: product.status,
    is_blocked: product.isBlocked,
    block_reason: product.blockReason,
    rejection_reason: product.rejectionReason,
    version: product.version,
    updated_at: isoRequired(product.updatedAt),
    created_at: isoRequired(product.createdAt),
    seller: toSellerSummary(product.seller, aggregates),
    category_name: categoryName,
    description: product.description,
    images: sortedImages(product, true),
    condition: product.condition,
    usage_months: product.usageMonths,
    province_code: product.provinceCode,
    delivery_method: product.deliveryMethod,
    shipping_fee: product.shippingFee.toString(),
  };
}

/* ------------------------------------------------------------------ *
 * Orders
 * ------------------------------------------------------------------ */

export type OrderRow = Order & {
  items: OrderItem[];
  buyer: User;
  seller: User;
  deliveryInfo: OrderDeliveryInfo | null;
  statusHistory: OrderStatusHistory[];
  conversation: { id: string } | null;
};

export function toOrderItemSnapshot(item: OrderItem): import("@remarket/shared").OrderItemSnapshot {
  return {
    id: item.id,
    product_id: item.productId,
    title_snapshot: item.titleSnapshot,
    condition_snapshot: item.conditionSnapshot,
    image_path_snapshot: item.imagePathSnapshot,
    // Order DTOs are participant/admin scoped. Browser images cannot attach
    // the memory-only bearer token, including when the listing was removed.
    image_url: item.imagePathSnapshot ? createPrivateStorageUrl(item.imagePathSnapshot) : usableImageUrl(item.imageUrl),
    price: item.price.toString(),
  };
}

export interface OrderViewer {
  id: string;
  status: "ACTIVE" | "LOCKED";
}

/** Safe message shown when `complete` is unavailable (detail-project 11.2). */
export function completionBlockReason(hasOpenTicket: boolean): string | null {
  if (!hasOpenTicket) return null;
  return "Đơn hàng đang có yêu cầu hỗ trợ chưa xử lý. Vui lòng đóng yêu cầu trước khi xác nhận đã nhận.";
}

/**
 * Authoritative action list for one order (detail-project 11). Derived from
 * role + status + account state + open ticket + expiry, never from the client.
 */
export function orderAllowedActions(
  order: OrderRow,
  viewer: OrderViewer,
  hasOpenTicket: boolean,
  hasExistingReview: boolean,
): OrderAction[] {
  const isBuyer = order.buyerId === viewer.id;
  const isSeller = order.sellerId === viewer.id;
  if (!isBuyer && !isSeller) return [];

  if (viewer.status === "LOCKED") return ["support"];
  if (order.status === "CANCELLED") return ["support"];

  const actions: OrderAction[] = [];
  const add = (action: OrderAction) => {
    if (!actions.includes(action)) actions.push(action);
  };

  const expired = order.expiresAt !== null && order.expiresAt.getTime() <= Date.now();

  if (isBuyer) {
    switch (order.status) {
      case "PENDING":
        add("cancel");
        break;
      case "CONFIRMED":
        if (order.deliveryMethod === "MEETUP") add("deliver");
        else add("cancel");
        break;
      case "SHIPPING":
        if (order.deliveryMethod === "COD") add("deliver");
        break;
      case "DELIVERED":
        if (!hasOpenTicket) add("complete");
        break;
      case "COMPLETED": {
        const withinWindow =
          order.completedAt !== null &&
          Date.now() - order.completedAt.getTime() <= REVIEW_LIMITS.windowDays * 24 * 60 * 60 * 1000;
        if (!hasExistingReview && withinWindow) add("review");
        break;
      }
      default:
        break;
    }
  } else {
    switch (order.status) {
      case "PENDING":
        if (!expired) add("confirm");
        add("cancel");
        break;
      case "CONFIRMED":
        if (order.deliveryMethod === "COD") add("ship");
        add("cancel");
        break;
      case "SHIPPING":
        // A seller declaration records the actor but does not prove buyer
        // receipt and never completes the order by itself.
        if (order.deliveryMethod === "COD") add("deliver");
        break;
      default:
        break;
    }
  }

  add("support");
  add("chat");
  return actions;
}

function toStatusHistory(entry: OrderStatusHistory): OrderStatusHistoryEntry {
  return {
    from_status: entry.fromStatus,
    to_status: entry.toStatus,
    actor_type: (entry.actorType as "USER" | "ADMIN" | "SYSTEM") ?? "SYSTEM",
    actor_name: entry.actorName,
    reason: entry.reason,
    created_at: isoRequired(entry.createdAt),
  };
}

function toDeliveryInfo(info: OrderDeliveryInfo | null, method: Order["deliveryMethod"]): OrderDeliveryDto {
  return {
    method,
    recipient_name: info?.recipientName ?? "",
    recipient_phone: info?.recipientPhone ?? "",
    delivery_address: info?.deliveryAddress ?? "",
    carrier: info?.carrier ?? null,
    tracking_code: info?.trackingCode ?? null,
  };
}

export function orderRole(order: Order, viewerId: string): "buyer" | "seller" {
  return order.sellerId === viewerId ? "seller" : "buyer";
}

export function toOrderListItem(order: OrderRow, viewerId: string): OrderListItem {
  const role = orderRole(order, viewerId);
  const counterparty = role === "seller" ? order.buyer : order.seller;
  const aggregates = { rating: null, review_count: 0, completed_sales_count: 0 } as SellerAggregates;
  return {
    id: order.id,
    code: order.code,
    role,
    counterparty: toSellerSummary(counterparty, aggregates),
    status: order.status,
    delivery_method: order.deliveryMethod,
    items: order.items
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(toOrderItemSnapshot),
    total_amount: order.totalAmount.toString(),
    created_at: isoRequired(order.createdAt),
    expires_at: iso(order.expiresAt),
  };
}

export function toOrderDetail(
  order: OrderRow,
  viewer: OrderViewer,
  context: {
    hasOpenTicket: boolean;
    existingReview: Review | null;
    completionReason: string | null;
  },
): OrderDetail {
  const list = toOrderListItem(order, viewer.id);
  const isBuyer = order.buyerId === viewer.id;
  const withinWindow =
    order.completedAt !== null &&
    Date.now() - order.completedAt.getTime() <= REVIEW_LIMITS.windowDays * 24 * 60 * 60 * 1000;

  let reviewState: OrderReviewState;
  if (!isBuyer) {
    reviewState = {
      can_review: false,
      reason: "Chỉ người mua được đánh giá đơn hàng.",
      existing: order.sellerId === viewer.id && context.existingReview
        ? toReview(context.existingReview, order.buyer)
        : null,
    };
  } else if (order.status !== "COMPLETED") {
    reviewState = { can_review: false, reason: "Chỉ đánh giá sau khi đơn hàng hoàn tất.", existing: null };
  } else if (context.existingReview) {
    reviewState = {
      can_review: false,
      reason: "Bạn đã đánh giá đơn hàng này.",
      existing: toReview(context.existingReview, order.buyer),
    };
  } else if (!withinWindow) {
    reviewState = { can_review: false, reason: "Đã hết thời gian đánh giá đơn hàng.", existing: null };
  } else {
    reviewState = { can_review: true, reason: null, existing: null };
  }

  return {
    ...list,
    version: order.version,
    subtotal: order.subtotal.toString(),
    shipping_fee: order.shippingFee.toString(),
    currency: "VND",
    delivery: toDeliveryInfo(order.deliveryInfo, order.deliveryMethod),
    status_history: order.statusHistory
      .slice()
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map(toStatusHistory),
    allowed_actions: orderAllowedActions(order, viewer, context.hasOpenTicket, context.existingReview !== null),
    completion_block_reason: completionBlockReason(context.hasOpenTicket),
    cancellation_reason: order.cancellationReason,
    confirmed_at: iso(order.confirmedAt),
    shipped_at: iso(order.shippedAt),
    delivered_at: iso(order.deliveredAt),
    completed_at: iso(order.completedAt),
    cancelled_at: iso(order.cancelledAt),
    review: reviewState,
    conversation_id: order.conversation?.id ?? null,
  };
}

/* ------------------------------------------------------------------ *
 * Chat
 * ------------------------------------------------------------------ */

export function toConversationListItem(
  conversation: {
    id: string;
    updatedAt: Date;
    buyerId: string;
    sellerId: string;
    buyer: User;
    seller: User;
    product: (Product & { images: ProductImage[] }) | null;
    messages: { content: string; createdAt: Date; senderId: string }[];
  },
  viewerId: string,
  unreadCount: number,
): ConversationListItem {
  const counterparty = conversation.buyerId === viewerId ? conversation.seller : conversation.buyer;
  const last = conversation.messages[0] ?? null;
  return {
    id: conversation.id,
    counterparty: {
      id: counterparty.id,
      name: counterparty.fullName,
      avatar_url: avatarReadUrl(counterparty),
    },
    product: conversation.product
      ? {
          id: conversation.product.id,
          title: conversation.product.title,
          // Membership alone is not an image grant. Owners may preview their
          // own object; other readers retain the legacy resource policy.
          image_url: firstImageUrl(conversation.product, conversation.product.sellerId === viewerId, false),
          status: conversation.product.status,
          price: conversation.product.price.toString(),
        }
      : null,
    last_message: last
      ? { content: last.content, created_at: isoRequired(last.createdAt), sender_id: last.senderId }
      : null,
    unread_count: unreadCount,
    updated_at: isoRequired(conversation.updatedAt),
  };
}

export function toMessage(message: {
  id: string;
  clientMessageId: string;
  senderId: string;
  content: string;
  createdAt: Date;
  readAt: Date | null;
}): import("@remarket/shared").Message {
  return {
    id: message.id,
    client_message_id: message.clientMessageId,
    sender_id: message.senderId,
    content: message.content,
    created_at: isoRequired(message.createdAt),
    read_at: iso(message.readAt),
  };
}

/* ------------------------------------------------------------------ *
 * Reviews, reports, notifications, support, audit
 * ------------------------------------------------------------------ */

export function toReview(review: Review, reviewer: User): ReviewDto {
  return {
    id: review.id,
    order_id: review.orderId,
    rating: review.rating,
    comment: review.comment,
    created_at: isoRequired(review.createdAt),
    reviewer: {
      id: reviewer.id,
      name: reviewer.fullName,
      avatar_url: avatarReadUrl(reviewer),
    },
    reviewed_user_id: review.reviewedUserId,
  };
}

export function toAdminReviewItem(
  review: Review,
  reviewer: User,
  reviewedUserName: string,
  orderCode: string,
): AdminReviewItem {
  return {
    ...toReview(review, reviewer),
    order_code: orderCode,
    reviewed_user_name: reviewedUserName,
    hidden_at: iso(review.hiddenAt),
    hidden_reason: review.hiddenReason,
  };
}

export interface ReportRow {
  id: string;
  targetType: string;
  targetId: string;
  targetLabel: string;
  reason: Report["reason"];
  description: string | null;
  status: Report["status"];
  resolutionNote: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export function toReportRecord(report: ReportRow): ReportRecord {
  return {
    id: report.id,
    target_type: report.targetType === "user" ? "user" : "product",
    target_label: report.targetLabel,
    target_id: report.targetId,
    reason: report.reason,
    description: report.description,
    status: report.status,
    resolution_note: report.resolutionNote,
    created_at: isoRequired(report.createdAt),
    updated_at: isoRequired(report.updatedAt),
  };
}

export function toAdminReportItem(
  report: ReportRow,
  reporterName: string,
  handledByName: string | null,
  handledAt: Date | null,
): AdminReportItem {
  return {
    ...toReportRecord(report),
    reporter_name: reporterName,
    handled_by_name: handledByName,
    handled_at: iso(handledAt),
  };
}

export function toNotification(notification: {
  id: string;
  userId: string;
  type: NotificationDto["type"];
  title: string;
  content: string;
  referenceType: string;
  referenceId: string | null;
  dedupeKey: string | null;
  readAt: Date | null;
  createdAt: Date;
}): NotificationDto {
  return {
    id: notification.id,
    user_id: notification.userId,
    type: notification.type,
    title: notification.title,
    content: notification.content,
    reference_type: notification.referenceType,
    reference_id: notification.referenceId,
    dedupe_key: notification.dedupeKey ?? undefined,
    read_at: iso(notification.readAt),
    created_at: isoRequired(notification.createdAt),
  };
}

export function toSupportTicketListItem(ticket: SupportTicket): SupportTicketListItem {
  return {
    id: ticket.id,
    code: ticket.code,
    subject: ticket.subject,
    type: ticket.type,
    status: ticket.status,
    order_id: ticket.orderId,
    created_at: isoRequired(ticket.createdAt),
    updated_at: isoRequired(ticket.updatedAt),
  };
}

export function toAdminSupportTicketItem(
  ticket: SupportTicket,
  user: Pick<User, "id" | "fullName">,
  assignedAdmin: Pick<User, "id" | "fullName"> | null,
): AdminSupportTicketItem {
  return {
    ...toSupportTicketListItem(ticket),
    user: { id: user.id, name: user.fullName },
    assigned_admin: assignedAdmin
      ? { id: assignedAdmin.id, name: assignedAdmin.fullName }
      : null,
  };
}

export function supportAllowedActions(
  ticket: SupportTicket,
  viewerIsAdmin: boolean,
): SupportAction[] {
  if (viewerIsAdmin) {
    const actions: SupportAction[] = [];
    if (ticket.status !== "CLOSED") actions.push("reply");
    if (ticket.status === "OPEN") actions.push("progress");
    if (ticket.status === "IN_PROGRESS") actions.push("resolve");
    if (ticket.status === "RESOLVED") actions.push("reopen");
    if (ticket.status !== "CLOSED") actions.push("close");
    return actions;
  }
  const actions: SupportAction[] = [];
  if (ticket.status === "OPEN" || ticket.status === "IN_PROGRESS") actions.push("reply");
  if (ticket.status === "RESOLVED") actions.push("reply", "close");
  return actions;
}

export function toSupportTicketDetail(
  ticket: SupportTicket,
  messages: SupportMessage[],
  senderNames: Map<string, User>,
  viewerIsAdmin: boolean,
  assignedAdminName: string | null,
): SupportTicketDetail {
  return {
    ...toSupportTicketListItem(ticket),
    resolution_note: ticket.resolutionNote,
    resolved_at: iso(ticket.resolvedAt),
    closed_at: iso(ticket.closedAt),
    assigned_admin_name: viewerIsAdmin ? assignedAdminName : null,
    messages: messages.map((message): SupportMessageDto => {
      const sender = senderNames.get(message.senderId);
      const hideAdminIdentity = !viewerIsAdmin && message.role === "ADMIN";
      return {
        id: message.id,
        sender: {
          id: hideAdminIdentity ? "support" : message.senderId,
          name: hideAdminIdentity ? "Bộ phận hỗ trợ" : (sender?.fullName ?? "Người dùng"),
          role: message.role === "ADMIN" ? "ADMIN" : "USER",
        },
        message: message.message,
        created_at: isoRequired(message.createdAt),
      };
    }),
    allowed_actions: supportAllowedActions(ticket, viewerIsAdmin),
  };
}

export function toAdminSupportTicketDetail(
  detail: SupportTicketDetail,
  user: Pick<User, "id" | "fullName">,
  assignedAdmin: Pick<User, "id" | "fullName"> | null,
  order: (Order & {
    items: OrderItem[];
    buyer: Pick<User, "id" | "fullName">;
    seller: Pick<User, "id" | "fullName">;
    statusHistory: OrderStatusHistory[];
  }) | null,
): AdminSupportTicketDetail {
  return {
    ...detail,
    user: { id: user.id, name: user.fullName },
    assigned_admin: assignedAdmin
      ? { id: assignedAdmin.id, name: assignedAdmin.fullName }
      : null,
    order: order ? toAdminSupportOrderSummary(order) : null,
  };
}

export function toAdminSupportOrderSummary(
  order: Order & {
    items: OrderItem[];
    buyer: Pick<User, "id" | "fullName">;
    seller: Pick<User, "id" | "fullName">;
    statusHistory: OrderStatusHistory[];
  },
): AdminSupportOrderSummary {
  return {
    id: order.id,
    code: order.code,
    status: order.status,
    version: order.version,
    buyer: { id: order.buyer.id, name: order.buyer.fullName },
    seller: { id: order.seller.id, name: order.seller.fullName },
    delivery_method: order.deliveryMethod,
    items: order.items
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(toOrderItemSnapshot),
    total_amount: order.totalAmount.toString(),
    created_at: isoRequired(order.createdAt),
    status_history: order.statusHistory
      .slice()
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map(toStatusHistory),
    cancellation_reason: order.cancellationReason,
  };
}

export function toAuditLogItem(log: {
  id: string;
  actorId: string | null;
  actorName: string | null;
  actorType: string;
  action: string;
  entityType: string;
  entityId: string | null;
  reason: string | null;
  metadata: unknown;
  createdAt: Date;
}): AuditLogItem {
  return {
    id: log.id,
    actor_id: log.actorId,
    actor_name: log.actorName,
    actor_type: (log.actorType as "USER" | "ADMIN" | "SYSTEM") ?? "SYSTEM",
    action: log.action,
    entity_type: log.entityType,
    entity_id: log.entityId,
    reason: log.reason,
    metadata: (log.metadata ?? {}) as Record<string, unknown>,
    created_at: isoRequired(log.createdAt),
  };
}
