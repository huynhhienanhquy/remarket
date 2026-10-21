import { useState } from "react";
import { Text, View } from "react-native";
import { formatDateTime } from "@remarket/shared";
import { api } from "../../services/runtime";
import { SelectField } from "../../components/SelectField";
import { Button, styles } from "../../components/ui";
import {
  AdminList,
  AdminSearch,
  AdvancedFilters,
  DecisionSheet,
  moderationFields,
  useAdminList,
} from "../../features/admin/common";
import type { Decision } from "../../features/admin/common";

export default function AdminReviews() {
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [rating, setRating] = useState("");
  const [visibility, setVisibility] = useState("");
  const [advanced, setAdvanced] = useState<Record<string, string>>({});
  const [decision, setDecision] = useState<Decision | null>(null);
  const input = {
    ...advanced,
    page,
    q: q || undefined,
    rating: rating ? Number(rating) : undefined,
    visibility:
      visibility === "VISIBLE"
        ? ("VISIBLE" as const)
        : visibility === "HIDDEN"
          ? ("HIDDEN" as const)
          : undefined,
  };
  const query = useAdminList("reviews", input, () => api.admin.reviews(input));
  return (
    <AdminList
      title="Đánh giá"
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
            label="Số sao"
            value={rating}
            items={[
              { value: "", label: "Tất cả" },
              ...[1, 2, 3, 4, 5].map((value) => ({
                value: String(value),
                label: `${value} sao`,
              })),
            ]}
            onChange={(value) => {
              setRating(value);
              setPage(1);
            }}
          />
          <SelectField
            label="Hiển thị"
            value={visibility}
            items={[
              { value: "", label: "Tất cả" },
              { value: "VISIBLE", label: "Đang hiển thị" },
              { value: "HIDDEN", label: "Đã ẩn" },
            ]}
            onChange={(value) => {
              setVisibility(value);
              setPage(1);
            }}
          />
          <AdvancedFilters
            fields={moderationFields}
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
          <Text style={styles.heading}>
            {item.rating} / 5 · {item.order_code}
          </Text>
          <Text style={styles.text}>
            {item.reviewer.name} → {item.reviewed_user_name}
          </Text>
          <Text style={styles.text}>
            {item.comment ?? "Không có nhận xét."}
          </Text>
          <Text style={styles.muted}>{formatDateTime(item.created_at)}</Text>
          {item.hidden_at ? (
            <Text style={styles.error}>Đã ẩn: {item.hidden_reason}</Text>
          ) : (
            <Button
              title="Ẩn đánh giá"
              danger
              onPress={() =>
                setDecision({
                  title: "Ẩn đánh giá",
                  reason: true,
                  danger: true,
                  run: (note) => api.admin.hideReview(item.id, note),
                })
              }
            />
          )}
        </View>
      ))}
      <DecisionSheet
        key={decision?.title}
        decision={decision}
        onClose={() => setDecision(null)}
      />
    </AdminList>
  );
}
