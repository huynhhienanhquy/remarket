import { useState } from "react";
import { Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import {
  PRODUCT_STATUSES,
  PRODUCT_STATUS_LABELS,
  CONDITION_LABELS,
  formatDateTime,
  formatVnd,
} from "@remarket/shared";
import { api } from "../../services/runtime";
import { deliveryLabel } from "../../services/marketplace";
import { ProductGallery } from "../../components/ProductGallery";
import { SelectField } from "../../components/SelectField";
import { Sheet } from "../../components/Sheet";
import { Button, Feedback, styles } from "../../components/ui";
import { useSession } from "../../services/session-context";
import {
  AdminList,
  AdminSearch,
  AdvancedFilters,
  DecisionSheet,
  moderationFields,
  useAdminList,
} from "../../features/admin/common";
import type { Decision } from "../../features/admin/common";

export default function AdminProducts() {
  const { user } = useSession();
  const params = useLocalSearchParams<{ selected?: string }>();
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("PENDING");
  const [category, setCategory] = useState("");
  const [advanced, setAdvanced] = useState<Record<string, string>>({});
  const [id, setId] = useState(params.selected);
  const [decision, setDecision] = useState<Decision | null>(null);
  const input = {
    ...advanced,
    page,
    q: q || undefined,
    category_id: category || undefined,
    status:
      status === "BLOCKED"
        ? ("BLOCKED" as const)
        : PRODUCT_STATUSES.find((value) => value === status),
  };
  const query = useAdminList("products", input, () =>
    api.admin.products(input),
  );
  const tree = useQuery({
    queryKey: ["admin", "category-tree"],
    queryFn: api.admin.categoryTree,
  });
  const listed = query.data?.items.find((item) => item.id === id);
  // Dashboard queues are oldest-first; a selected item may be outside this list page.
  // The existing detail endpoint allows admins to read pending/blocked products.
  const detail = useQuery({
    queryKey: ["products", "admin-review", user?.id, id],
    queryFn: () => api.products.detail(id!),
    enabled: !!id && !listed,
  });
  const selected = listed ?? (detail.error ? undefined : detail.data);
  return (
    <AdminList
      title="Sản phẩm và kiểm duyệt"
      query={query}
      page={page}
      onPage={setPage}
      filters={
        <>
          <AdminSearch
            onSearch={(value) => {
              setQ(value);
              setPage(1);
            }}
          />
          <SelectField
            label="Trạng thái"
            value={status}
            items={[
              { value: "", label: "Tất cả" },
              ...PRODUCT_STATUSES.map((value) => ({
                value,
                label: PRODUCT_STATUS_LABELS[value].label,
              })),
              { value: "BLOCKED", label: "Bị hạn chế" },
            ]}
            onChange={(value) => {
              setStatus(value);
              setPage(1);
              setId(undefined);
            }}
          />
          <SelectField
            label="Danh mục"
            value={category}
            items={[
              { value: "", label: "Tất cả" },
              ...(tree.data ?? [])
                .flatMap((root) => [root, ...(root.children ?? [])])
                .map((item) => ({ value: item.id, label: item.name })),
            ]}
            onChange={(value) => {
              setCategory(value);
              setPage(1);
            }}
          />
          <AdvancedFilters
            fields={[
              { key: "seller_id", label: "Mã người bán" },
              ...moderationFields,
            ]}
            onApply={(value) => {
              setAdvanced(value);
              setPage(1);
            }}
          />
        </>
      }
    >
      {query.data?.items.map((item) => (
        <View key={item.id} style={styles.card}>
          <Text style={styles.heading}>{item.title}</Text>
          <Text style={styles.text}>
            {formatVnd(item.price)} · {item.seller.name}
          </Text>
          <Text style={styles.muted}>
            {PRODUCT_STATUS_LABELS[item.status].label}
            {item.is_blocked ? " · Bị hạn chế" : ""}
          </Text>
          <Button title="Xem xét" secondary onPress={() => setId(item.id)} />
        </View>
      ))}
      <Sheet
        visible={!!id && !decision}
        title="Xem xét tin đăng"
        onClose={() => setId(undefined)}
      >
        {!listed && (
          <Feedback
            loading={detail.isPending}
            error={detail.error}
            retry={() => {
              void detail.refetch();
            }}
          />
        )}
        {selected && (
          <>
            <ProductGallery images={selected.images} title={selected.title} />
            <Text style={styles.heading}>{selected.title}</Text>
            <Text style={styles.heading}>{formatVnd(selected.price)}</Text>
            <Text style={styles.text}>
              {selected.seller.name} ·{" "}
              {"category_name" in selected
                ? selected.category_name
                : selected.category_path.join(" / ")}
            </Text>
            <Text style={styles.text}>
              {CONDITION_LABELS[selected.condition]} ·{" "}
              {selected.usage_months === null
                ? "Chưa cung cấp thời gian sử dụng"
                : `${selected.usage_months} tháng sử dụng`}
            </Text>
            <Text style={styles.text}>
              {deliveryLabel(selected.delivery_method)} · Phí{" "}
              {formatVnd(selected.shipping_fee)}
            </Text>
            <Text style={styles.text}>{selected.description}</Text>
            <Text style={styles.muted}>
              Phiên bản {selected.version} ·{" "}
              {"updated_at" in selected ? "Cập nhật" : "Tạo ngày"}{" "}
              {"updated_at" in selected
                ? formatDateTime(selected.updated_at)
                : formatDateTime(selected.created_at)}
            </Text>
            {(selected.block_reason || selected.rejection_reason) && (
              <Text style={styles.error}>
                {selected.block_reason ?? selected.rejection_reason}
              </Text>
            )}
            {selected.status === "PENDING" && !selected.is_blocked && (
              <>
                <Button
                  title="Duyệt tin"
                  onPress={() =>
                    setDecision({
                      title: "Duyệt tin đăng",
                      description: `Bạn đang duyệt phiên bản ${selected.version}.`,
                      run: () =>
                        api.admin.approveProduct(selected.id, selected.version),
                    })
                  }
                />
                <Button
                  title="Từ chối tin"
                  danger
                  onPress={() =>
                    setDecision({
                      title: "Từ chối tin đăng",
                      reason: true,
                      danger: true,
                      run: (note) =>
                        api.admin.rejectProduct(
                          selected.id,
                          selected.version,
                          note,
                        ),
                    })
                  }
                />
              </>
            )}
            <Button
              title={selected.is_blocked ? "Gỡ hạn chế" : "Hạn chế tin"}
              secondary
              onPress={() =>
                setDecision(
                  selected.is_blocked
                    ? {
                        title: "Gỡ hạn chế tin đăng",
                        description:
                          "Gỡ hạn chế không tự đăng lại tin; người bán cần gửi duyệt lại.",
                        run: () =>
                          api.admin.unblockProduct(
                            selected.id,
                            selected.version,
                          ),
                      }
                    : {
                        title: "Hạn chế tin đăng",
                        reason: true,
                        danger: true,
                        run: (note) =>
                          api.admin.blockProduct(
                            selected.id,
                            selected.version,
                            note,
                          ),
                      },
                )
              }
            />
          </>
        )}
      </Sheet>
      <DecisionSheet
        key={decision?.title}
        decision={decision}
        onClose={() => {
          setDecision(null);
          setId(undefined);
        }}
      />
    </AdminList>
  );
}
