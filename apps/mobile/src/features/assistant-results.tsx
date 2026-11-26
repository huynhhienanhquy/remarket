import { useQuery } from "@tanstack/react-query";
import { Link } from "expo-router";
import type { Href } from "expo-router";
import { Text, View } from "react-native";
import {
  ACCOUNT_STATS_LABELS,
  formatDateTime,
  formatVnd,
} from "@remarket/shared";
import type { AccountStatsTopic, AiToolResult } from "@remarket/shared";
import { ProductGrid } from "../components/ProductCards";
import { colors, Feedback, styles } from "../components/ui";
import { api } from "../services/runtime";
import { parseAssistantResult } from "../services/assistant-results";

const faqLinks = {
  "/support/new": "/support/new",
  "/products": "/products",
  "/account/products": "/my-products",
  "/orders": "/orders",
  "/verify-email": "/verify-email",
} as const satisfies Record<string, Href>;

const accountLinks: Record<AccountStatsTopic, { href: Href; label: string }> = {
  sales: { href: { pathname: "/orders", params: { role: "seller" } }, label: "Đơn bán" },
  purchases: { href: "/orders", label: "Đơn mua" },
  listings: { href: "/my-products", label: "Tin của tôi" },
  favorites: { href: "/favorites", label: "Tin đã lưu" },
  reviews: { href: "/account", label: "Tài khoản" },
  support: { href: "/support", label: "Hỗ trợ" },
};

function ResultLink({ href, children }: { href: Href; children: string }) {
  return (
    <Link href={href} push style={[styles.label, { color: colors.green, paddingVertical: 10, textDecorationLine: "underline" }]}>
      {children}
    </Link>
  );
}

export function AssistantFallbackLinks() {
  return (
    <View style={styles.row}>
      <ResultLink href="/products">Tìm sản phẩm</ResultLink>
      <ResultLink href="/support/new">Gửi yêu cầu hỗ trợ</ResultLink>
    </View>
  );
}

function SearchResult({ result, generation }: {
  result: Extract<AiToolResult, { kind: "search" }>;
  generation: number;
}) {
  const ids = result.product_ids;
  const products = useQuery({
    queryKey: ["ai", "products", generation, ids],
    queryFn: () => api.ai.resolveProducts(ids),
    enabled: ids.length > 0,
    refetchOnMount: "always",
  });
  return (
    <View style={styles.card}>
      <Text style={styles.label}>
        {result.total ? `${result.total} tin phù hợp lúc tìm` : "Chưa có tin phù hợp"}
      </Text>
      {result.labels.length > 0 && (
        <View style={styles.row} accessibilityLabel="Bộ lọc đã áp dụng">
          {result.labels.map((label, index) => (
            <Text key={index} style={[styles.meta, { borderRadius: 12, backgroundColor: colors.subtle, paddingHorizontal: 8, paddingVertical: 4 }]}>
              {label}
            </Text>
          ))}
        </View>
      )}
      {result.total === 0 && (
        <Text style={styles.muted}>Bạn có thể hỏi tiếp, chẳng hạn “Bỏ giới hạn địa điểm”.</Text>
      )}
      <Feedback loading={products.isFetching} error={products.error} retry={() => void products.refetch()} />
      {!products.isFetching && products.isSuccess && (
        products.data.length > 0
          ? <ProductGrid items={products.data} />
          : <Text style={styles.muted}>Các tin trong kết quả này đã thay đổi.</Text>
      )}
      <ResultLink href={{ pathname: "/products", params: { ...result.filters } }}>
        {result.total ? "Xem tất cả" : "Mở bộ lọc tìm kiếm"}
      </ResultLink>
    </View>
  );
}

export function AssistantResult({ content, generation }: { content: string; generation: number }) {
  const result = parseAssistantResult(content);
  if (!result) return null;
  switch (result.kind) {
    case "search":
      return <SearchResult result={result} generation={generation} />;
    case "clarify":
      return <Text style={[styles.card, styles.text]}>{result.message}</Text>;
    case "faq":
      return (
        <View style={styles.card}>
          {result.sources.length > 0 ? (
            <>
              <Text style={styles.label}>Nguồn ReMarket</Text>
              {result.sources.map((source) => (
                <ResultLink key={source.id} href={faqLinks[source.href]}>
                  {`${source.title} · ${source.id}`}
                </ResultLink>
              ))}
            </>
          ) : <ResultLink href="/support/new">Gửi yêu cầu hỗ trợ</ResultLink>}
        </View>
      );
    case "account_stats":
      return (
        <View style={styles.card}>
          <Text style={styles.label}>{result.period_label}</Text>
          <Text style={styles.meta}>Cập nhật {formatDateTime(result.as_of)}</Text>
          {result.rows.map(({ key, value }) => (
            <View key={key} style={[styles.row, { justifyContent: "space-between" }]}>
              <Text style={[styles.muted, { flex: 1 }]}>{ACCOUNT_STATS_LABELS[key]}</Text>
              <Text style={styles.label}>
                {value === null ? "Chưa có đánh giá" : typeof value === "string" ? formatVnd(value) : value.toLocaleString("vi-VN")}
              </Text>
            </View>
          ))}
          <View style={styles.row}>
            {result.topics.map((topic) => (
              <ResultLink key={topic} href={accountLinks[topic].href}>{accountLinks[topic].label}</ResultLink>
            ))}
          </View>
        </View>
      );
  }
}
