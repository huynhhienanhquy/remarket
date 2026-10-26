import { useState } from "react";
import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { PRODUCT_STATUS_LABELS, formatVnd } from "@remarket/shared";
import type { ProductStatus } from "@remarket/shared";
import { api } from "../../services/runtime";
import { MarketplaceImage } from "../../components/MarketplaceImage";
import { SelectField } from "../../components/SelectField";
import { Button, EmptyState, Feedback, Pagination, styles } from "../../components/ui";
import { useAdminList } from "./common";

export function AdminUserProducts({ userId, onOpenProduct }: { userId: string; onOpenProduct: () => void }) {
  const router = useRouter();
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const input = { seller_id: userId, ...(status ? { status: status as ProductStatus } : {}), page };
  const query = useAdminList("products", input, () => api.admin.products(input));
  return <View style={{ gap: 16 }}>
    <Text accessibilityRole="header" style={styles.heading}>Sản phẩm của người dùng</Text>
    <SelectField label="Trạng thái sản phẩm" value={status} items={[
      { value: "", label: "Tất cả" }, { value: "ACTIVE", label: "Đang bán" },
      { value: "SOLD", label: "Đã bán" }, { value: "PENDING", label: "Chờ duyệt" },
    ]} onChange={(value) => { setStatus(value); setPage(1); }} />
    <Feedback loading={query.isPending} error={query.error} retry={() => { void query.refetch(); }} />
    {!query.error && query.data && <>
      {query.data.items.length === 0 && <EmptyState title={status ? "Không có sản phẩm ở trạng thái này" : "Người dùng chưa có sản phẩm"} />}
      {query.data.items.map((product) => <View key={product.id} style={styles.card}>
        {product.image_url && <MarketplaceImage uri={product.image_url} style={{ width: "100%", height: 160, borderRadius: 8 }} />}
        <Text style={styles.heading}>{product.title}</Text>
        <Text style={styles.text}>{formatVnd(product.price)}</Text>
        <Text style={styles.muted}>{PRODUCT_STATUS_LABELS[product.status].label}{product.is_blocked ? " · Bị hạn chế" : ""}</Text>
        <Text style={styles.muted}>{product.category_name}</Text>
        <Button title="Xem chi tiết" secondary onPress={() => {
          onOpenProduct();
          router.push({ pathname: "/admin/products", params: { selected: product.id, seller_id: userId, status: status || "ALL", page: String(page) } });
        }} />
      </View>)}
      <Pagination page={query.data.meta.page} total={query.data.meta.total} pageSize={query.data.meta.page_size} onChange={setPage} />
    </>}
  </View>;
}
