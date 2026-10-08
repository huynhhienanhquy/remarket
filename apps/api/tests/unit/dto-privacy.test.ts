import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  toProductDetail,
  toSavedProductListItem,
  toSupportTicketDetail,
} from "../../src/shared/dto-mappers.js";
import type { ProductRow, ViewerContext } from "../../src/shared/dto-mappers.js";

const product = {
  id: "product-1",
  title: "Máy ảnh",
  description: "Mô tả",
  price: new Prisma.Decimal(1_000_000),
  condition: "USED_GOOD",
  usageMonths: 12,
  categoryId: "category-1",
  provinceCode: "01",
  deliveryMethod: "COD",
  shippingFee: new Prisma.Decimal(30_000),
  status: "ACTIVE",
  version: 3,
  isBlocked: false,
  blockReason: "ghi chú kiểm duyệt nội bộ",
  rejectionReason: "lý do từ lần duyệt trước",
  reservedOrderId: null,
  deletedAt: null,
  reviewedBy: null,
  reviewedAt: null,
  sellerId: "seller-1",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  publishedAt: new Date("2026-01-01T00:00:00.000Z"),
  images: [{
    id: "image-1",
    productId: "product-1",
    url: "/api/v1/uploads/image.jpg",
    storagePath: "users/seller-1/product/image.jpg",
    sortOrder: 0,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
  }],
  seller: {
    id: "seller-1",
    fullName: "Người bán",
    avatarUrl: null,
    provinceCode: "01",
    joinedAt: new Date("2025-01-01T00:00:00.000Z"),
  },
} as unknown as ProductRow;

function context(viewerId: string | null): ViewerContext {
  return {
    viewerId,
    viewerRole: "USER",
    viewerStatus: "ACTIVE",
    viewerEmailVerified: true,
    favorited: new Set(),
    aggregates: new Map(),
  };
}

describe("product DTO privacy", () => {
  it("does not expose private storage keys or moderation notes publicly", () => {
    const detail = toProductDetail(product, context("buyer-1"), ["Điện tử"], true);
    expect(detail.images[0]).not.toHaveProperty("storage_path");
    expect(detail.images[0]?.url).toBe("/api/v1/uploads/image.jpg");
    expect(detail.image_url).toBe("/api/v1/uploads/image.jpg");
    expect(detail.block_reason).toBeNull();
    expect(detail.rejection_reason).toBeNull();
  });

  it("keeps edit metadata for the owner", () => {
    const detail = toProductDetail(product, context("seller-1"), ["Điện tử"], true);
    expect(detail.images[0]?.storage_path).toBe("users/seller-1/product/image.jpg");
    expect(detail.images[0]?.url).toMatch(
      /^\/api\/v1\/uploads\/image\.jpg\?expires=\d+&signature=[A-Za-z0-9_-]+$/,
    );
    expect(detail.image_url).toMatch(
      /^\/api\/v1\/uploads\/image\.jpg\?expires=\d+&signature=[A-Za-z0-9_-]+$/,
    );
    expect(detail.block_reason).toBe("ghi chú kiểm duyệt nội bộ");
    expect(detail.rejection_reason).toBe("lý do từ lần duyệt trước");
  });

  it("redacts blocked content while retaining a private saved-item placeholder", () => {
    const item = toSavedProductListItem(
      { ...product, isBlocked: true } as ProductRow,
      context("buyer-1"),
    );
    expect(item).toMatchObject({
      id: "product-1",
      title: "",
      price: "0",
      image_url: null,
      is_blocked: true,
      is_hidden: true,
    });
  });
});

describe("support DTO privacy", () => {
  it("hides an individual admin identity from the ticket owner", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const detail = toSupportTicketDetail(
      {
        id: "ticket-1",
        code: "TK-000001",
        userId: "user-1",
        orderId: null,
        assignedAdminId: "admin-1",
        subject: "Hỗ trợ",
        type: "ACCOUNT",
        status: "IN_PROGRESS",
        resolutionNote: null,
        resolvedAt: null,
        closedAt: null,
        createdAt: now,
        updatedAt: now,
      },
      [{
        id: "message-1",
        ticketId: "ticket-1",
        senderId: "admin-1",
        role: "ADMIN",
        message: "Đang kiểm tra yêu cầu.",
        createdAt: now,
      }],
      new Map([["admin-1", { id: "admin-1", fullName: "Tên quản trị nội bộ" } as never]]),
      false,
      null,
    );
    expect(detail.assigned_admin_name).toBeNull();
    expect(detail.messages[0]?.sender).toEqual({
      id: "support",
      name: "Bộ phận hỗ trợ",
      role: "ADMIN",
    });
  });
});
