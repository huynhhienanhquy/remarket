import { REVIEW_LIMITS, validateReviewComment, validateReportDescription } from "@remarket/shared";
import type {
  NotificationsApi,
  ProfilesApi,
  ReportsApi,
  ReviewsApi,
} from "../lib/api/contract";
import { currentViewer } from "./adapter-auth";
import { notify } from "./adapter-notify";
import { db } from "./store";
import {
  conflict,
  findProduct,
  isPubliclyVisible,
  mustFindUser,
  notFound,
  paginate,
  parsePaging,
  projectListItem,
  requireActive,
  requireAuth,
  requireVerified,
  sellerSummary,
  validationError,
} from "./adapter-helpers";
import type { MockReview } from "./types";

function projectReview(review: MockReview) {
  return {
    id: review.id,
    order_id: review.order_id,
    rating: review.rating,
    comment: review.comment,
    created_at: review.created_at,
    reviewer: review.reviewer,
    reviewed_user_id: review.reviewed_user_id,
  };
}

export const reviewsApi: ReviewsApi = {
  async create(orderId, input) {
    const viewer = requireActive(currentViewer());
    const database = db();
    const order = database.orders.find((entry) => entry.id === orderId);
    if (!order) notFound("Không tìm thấy đơn hàng này.");
    if (order.buyer_id !== viewer.id) validationError("Chỉ người mua đánh giá đơn này.");

    if (order.status !== "COMPLETED") {
      conflict("REVIEW_NOT_ALLOWED", "Chỉ đánh giá sau khi đơn hoàn tất.");
    }
    if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
      validationError("Điểm đánh giá từ 1 đến 5.", { rating: "Chọn 1–5 sao." });
    }
    const comment = input.comment?.trim() ?? "";
    const commentError = validateReviewComment(comment);
    if (commentError) validationError(commentError, { comment: commentError });

    const existing = database.reviews.find(
      (entry) => entry.order_id === orderId && entry.reviewer_id === viewer.id,
    );
    if (existing) conflict("REVIEW_NOT_ALLOWED", "Đơn này đã được đánh giá.");

    const withinWindow =
      order.completed_at !== null &&
      Date.now() - new Date(order.completed_at).getTime() <=
        REVIEW_LIMITS.windowDays * 24 * 60 * 60 * 1000;
    if (!withinWindow) {
      conflict(
        "REVIEW_NOT_ALLOWED",
        `Đã quá thời hạn đánh giá (${REVIEW_LIMITS.windowDays} ngày sau khi hoàn tất).`,
      );
    }

    const review: MockReview = {
      id: `00000009-0000-4000-8000-${(database.reviews.length + 700).toString(16).padStart(12, "0")}`,
      order_id: orderId,
      reviewer_id: viewer.id,
      reviewed_user_id: order.seller_id,
      rating: input.rating,
      comment: comment === "" ? null : comment,
      created_at: new Date().toISOString(),
      hidden_at: null,
      hidden_reason: null,
      reviewer: {
        id: viewer.id,
        name: viewer.full_name,
        avatar_url: viewer.avatar_url,
      },
    };
    database.reviews.push(review);

    notify(database, order.seller_id, {
      type: "REVIEW_CREATED",
      title: "Bạn có đánh giá mới",
      content: `${viewer.full_name} đã đánh giá ${input.rating}/5 cho đơn #${order.code}.`,
      reference_type: "order",
      reference_id: order.id,
    });
    return projectReview(review);
  },

  async publicList(userId, page) {
    const database = db();
    mustFindUser(database, userId);
    const paging = parsePaging({ page, page_size: 10 });
    const rows = database.reviews
      .filter((review) => review.reviewed_user_id === userId && review.hidden_at === null)
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    const { slice, meta } = paginate(rows, paging);
    return { items: slice.map(projectReview), meta: { total: meta.total } };
  },
};

export const reportsApi: ReportsApi = {
  async create(input) {
    const viewer = requireVerified(currentViewer());
    const database = db();

    const errors: Record<string, string> = {};
    const description = input.description?.trim() ?? "";
    const descriptionError = validateReportDescription(description, input.reason);
    if (descriptionError) errors.description = descriptionError;
    if (Object.keys(errors).length > 0) {
      validationError("Nội dung báo cáo chưa hợp lệ.", errors);
    }

    if (input.target_type === "product") {
      if (!input.product_id) validationError("Thiếu sản phẩm cần báo cáo.");
      const product = findProduct(database, input.product_id);
      if (!product) notFound("Không tìm thấy món đồ này.");
      if (product.seller_id === viewer.id) {
        validationError("Không thể báo cáo món đồ của chính mình.");
      }
      const duplicate = database.reports.find(
        (report) =>
          report.reporter_id === viewer.id &&
          report.target_type === "product" &&
          report.target_id === product.id &&
          report.status === "PENDING",
      );
      if (duplicate) conflict("VERSION_CONFLICT", "Bạn đã gửi báo cáo này và đang chờ xử lý.");
    } else {
      if (!input.user_id) validationError("Thiếu người dùng cần báo cáo.");
      if (input.user_id === viewer.id) {
        validationError("Không thể báo cáo chính mình.");
      }
      const target = database.users.find((entry) => entry.id === input.user_id);
      if (!target) notFound("Không tìm thấy người dùng này.");
      const duplicate = database.reports.find(
        (report) =>
          report.reporter_id === viewer.id &&
          report.target_type === "user" &&
          report.target_id === target.id &&
          report.status === "PENDING",
      );
      if (duplicate) conflict("VERSION_CONFLICT", "Bạn đã gửi báo cáo này và đang chờ xử lý.");
    }

    const targetLabel =
      input.target_type === "product"
        ? findProduct(database, input.product_id!)?.title ?? "Món đồ"
        : mustFindUser(database, input.user_id!).full_name;

    const report = {
      id: `00000008-0000-4000-8000-${(database.reports.length + 800).toString(16).padStart(12, "0")}`,
      target_type: input.target_type,
      target_id: input.target_type === "product" ? input.product_id! : input.user_id!,
      target_label: targetLabel,
      reason: input.reason,
      description: description === "" ? null : description,
      status: "PENDING" as const,
      resolution_note: null,
      reporter_id: viewer.id,
      handled_by: null,
      handled_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    database.reports.push(report);
    return report;
  },

  async mine() {
    const viewer = requireAuth(currentViewer());
    const database = db();
    const rows = database.reports
      .filter((report) => report.reporter_id === viewer.id)
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    return { items: rows };
  },
};

export const notificationsApi: NotificationsApi = {
  async list(query) {
    const viewer = requireAuth(currentViewer());
    const database = db();
    const paging = parsePaging({ page: query.page, page_size: 20 });

    const own = database.notifications
      .filter((entry) => entry.user_id === viewer.id)
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    const unread = own.filter((entry) => entry.read_at === null).length;
    const filtered = query.unread ? own.filter((entry) => entry.read_at === null) : own;
    const { slice, meta } = paginate(filtered, paging);

    return { items: slice, meta: { total: meta.total, unread } };
  },

  async unreadCount() {
    const viewer = requireAuth(currentViewer());
    return db().notifications.filter(
      (entry) => entry.user_id === viewer.id && entry.read_at === null,
    ).length;
  },

  async markRead(id) {
    const viewer = requireAuth(currentViewer());
    const database = db();
    const entry = database.notifications.find((item) => item.id === id);
    if (!entry || entry.user_id !== viewer.id) notFound("Không tìm thấy thông báo này.");
    if (entry.read_at === null) entry.read_at = new Date().toISOString();
    return {
      unread: database.notifications.filter(
        (item) => item.user_id === viewer.id && item.read_at === null,
      ).length,
    };
  },

  async markAllRead() {
    const viewer = requireAuth(currentViewer());
    const database = db();
    const now = new Date().toISOString();
    let updated = 0;
    for (const entry of database.notifications) {
      if (entry.user_id === viewer.id && entry.read_at === null) {
        entry.read_at = now;
        updated += 1;
      }
    }
    return { unread: 0, updated };
  },
};

export const profilesApi: ProfilesApi = {
  async publicProfile(userId) {
    const database = db();
    // Only public seller information: no email, phone or address (15.1/16.4).
    return { seller: sellerSummary(database, userId) };
  },

  async products(userId, page) {
    const viewer = currentViewer();
    const database = db();
    mustFindUser(database, userId);
    const paging = parsePaging({ page, page_size: 12 });
    const rows = database.products
      .filter((product) => product.seller_id === userId && isPubliclyVisible(database, product))
      .sort((a, b) => (a.published_at ?? a.created_at) < (b.published_at ?? b.created_at) ? 1 : -1);
    const { slice, meta } = paginate(rows, paging);
    return { items: slice.map((product) => projectListItem(database, product, viewer)), meta };
  },
};
