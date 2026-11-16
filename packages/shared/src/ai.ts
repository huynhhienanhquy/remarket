import type { Condition, DeliveryMethod, SortOption } from "./enums.js";

export interface AiSearchFilters {
  q?: string;
  category_id?: string;
  province_code?: string;
  condition?: Condition;
  delivery_method?: DeliveryMethod;
  min_price?: string;
  max_price?: string;
  sort?: SortOption;
}

export interface AiFaqSource {
  id: string;
  title: string;
  version: string;
  href: "/support/new" | "/products" | "/account/products" | "/orders" | "/verify-email";
}

export const ACCOUNT_STATS_TOPICS = ["sales", "purchases", "listings", "favorites", "reviews", "support"] as const;
export type AccountStatsTopic = (typeof ACCOUNT_STATS_TOPICS)[number];

export const ACCOUNT_STATS_LABELS = {
  sales_placed: "Đơn bán được tạo",
  sales_in_progress: "Đơn bán đang xử lý trong số đơn được tạo",
  sales_pending: "Đơn bán chờ xác nhận",
  sales_confirmed: "Đơn bán đã xác nhận",
  sales_shipping: "Đơn bán đang giao",
  sales_delivered: "Đơn bán đã giao, chờ hoàn tất",
  sales_completed: "Đơn bán hoàn tất",
  sales_cancelled: "Đơn bán đã hủy",
  sales_items: "Món đã bán trong đơn hoàn tất",
  sales_revenue: "Tiền hàng từ đơn bán hoàn tất, chưa gồm phí giao",
  purchases_placed: "Đơn mua được tạo",
  purchases_in_progress: "Đơn mua đang xử lý trong số đơn được tạo",
  purchases_pending: "Đơn mua chờ xác nhận",
  purchases_confirmed: "Đơn mua đã xác nhận",
  purchases_shipping: "Đơn mua đang giao",
  purchases_delivered: "Đơn mua đã giao, chờ hoàn tất",
  purchases_completed: "Đơn mua hoàn tất",
  purchases_cancelled: "Đơn mua đã hủy",
  purchases_items: "Món đã mua trong đơn hoàn tất",
  purchases_spending: "Chi tiêu cho đơn mua hoàn tất, gồm phí giao",
  listings_total: "Tin đăng được tạo",
  listings_active: "Tin có trạng thái đang bán",
  listings_pending: "Tin chờ duyệt",
  listings_reserved: "Tin đang được giữ",
  listings_sold: "Tin có trạng thái đã bán",
  listings_rejected: "Tin bị từ chối",
  listings_inactive: "Tin đã ẩn",
  listings_blocked: "Tin bị chặn",
  favorites_total: "Tin đã lưu",
  reviews_total: "Đánh giá nhận được đang hiển thị",
  reviews_average: "Điểm đánh giá trung bình",
  support_total: "Yêu cầu hỗ trợ đã gửi",
  support_open: "Yêu cầu hỗ trợ đang mở hoặc xử lý",
} as const;

export interface AiAccountStats {
  kind: "account_stats";
  period_label: string;
  as_of: string;
  topics: AccountStatsTopic[];
  rows: { key: keyof typeof ACCOUNT_STATS_LABELS; value: number | string | null }[];
}

export type AiToolResult =
  | { kind: "search"; total: number; product_ids: string[]; filters: AiSearchFilters; labels: string[] }
  | { kind: "faq"; sources: AiFaqSource[] }
  | AiAccountStats
  | { kind: "clarify"; message: string; tool?: "get_account_stats" };

export interface AiThreadSummary {
  id: string;
  updated_at: string;
  expires_at: string;
}

export interface AiThread extends AiThreadSummary {
  messages: Array<{ id: string; role: "user" | "assistant"; content: string; results?: AiToolResult[] }>;
}
