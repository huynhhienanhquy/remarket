import { useState } from "react";
import { Text, View } from "react-native";
import {
  REPORT_REASONS,
  REPORT_REASON_LABELS,
  REPORT_STATUSES,
  REPORT_STATUS_LABELS,
  formatDateTime,
} from "@remarket/shared";
import type { AdminReportItem } from "@remarket/shared";
import { api } from "../../services/runtime";
import { SelectField } from "../../components/SelectField";
import { Sheet } from "../../components/Sheet";
import { Button, styles } from "../../components/ui";
import {
  AdminList,
  AdvancedFilters,
  DecisionSheet,
  moderationFields,
  useAdminList,
} from "../../features/admin/common";
import type { Decision } from "../../features/admin/common";

export default function AdminReports() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("PENDING");
  const [reason, setReason] = useState("");
  const [type, setType] = useState("");
  const [advanced, setAdvanced] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<AdminReportItem | null>(null);
  const [resolutionAction, setResolutionAction] = useState<
    "none" | "block_product" | "lock_user"
  >("none");
  const [decision, setDecision] = useState<Decision | null>(null);
  const input = {
    ...advanced,
    page,
    status: REPORT_STATUSES.find((value) => value === status),
    reason: REPORT_REASONS.find((value) => value === reason),
    target_type:
      type === "product"
        ? ("product" as const)
        : type === "user"
          ? ("user" as const)
          : undefined,
  };
  const query = useAdminList("reports", input, () => api.admin.reports(input));
  return (
    <AdminList
      title="Báo cáo vi phạm"
      query={query}
      page={page}
      onPage={setPage}
      filters={
        <>
          <SelectField
            label="Trạng thái"
            value={status}
            items={[
              { value: "", label: "Tất cả" },
              ...REPORT_STATUSES.map((value) => ({
                value,
                label: REPORT_STATUS_LABELS[value].label,
              })),
            ]}
            onChange={(value) => {
              setStatus(value);
              setPage(1);
            }}
          />
          <SelectField
            label="Lý do"
            value={reason}
            items={[
              { value: "", label: "Tất cả" },
              ...REPORT_REASONS.map((value) => ({
                value,
                label: REPORT_REASON_LABELS[value],
              })),
            ]}
            onChange={(value) => {
              setReason(value);
              setPage(1);
            }}
          />
          <SelectField
            label="Đối tượng"
            value={type}
            items={[
              { value: "", label: "Tất cả" },
              { value: "product", label: "Tin đăng" },
              { value: "user", label: "Người dùng" },
            ]}
            onChange={(value) => {
              setType(value);
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
          <Text style={styles.heading}>{item.target_label}</Text>
          <Text style={styles.text}>{REPORT_REASON_LABELS[item.reason]}</Text>
          <Text style={styles.muted}>
            {REPORT_STATUS_LABELS[item.status].label} · {item.reporter_name}
          </Text>
          <Button
            title="Xem báo cáo"
            secondary
            onPress={() => {
              setSelected(item);
              setResolutionAction("none");
            }}
          />
        </View>
      ))}
      <Sheet
        visible={!!selected && !decision}
        title="Xử lý báo cáo"
        onClose={() => setSelected(null)}
      >
        {selected && (
          <>
            <Text style={styles.heading}>{selected.target_label}</Text>
            <Text style={styles.text}>
              {REPORT_REASON_LABELS[selected.reason]}
            </Text>
            <Text style={styles.text}>
              {selected.description ?? "Không có mô tả bổ sung."}
            </Text>
            <Text style={styles.muted}>
              {selected.reporter_name} · {formatDateTime(selected.created_at)}
            </Text>
            {selected.resolution_note && (
              <Text style={styles.text}>
                Kết luận: {selected.resolution_note}
              </Text>
            )}
            {selected.handled_by_name && (
              <Text style={styles.muted}>
                Xử lý bởi {selected.handled_by_name}
              </Text>
            )}
            {selected.status === "PENDING" && (
              <>
                <SelectField
                  label="Hành động kèm kết luận"
                  value={resolutionAction}
                  items={[
                    { value: "none", label: "Chỉ ghi kết luận" },
                    selected.target_type === "product"
                      ? { value: "block_product", label: "Hạn chế tin đăng" }
                      : { value: "lock_user", label: "Khóa người dùng" },
                  ]}
                  onChange={(value) => {
                    if (
                      value === "none" ||
                      value === "block_product" ||
                      value === "lock_user"
                    )
                      setResolutionAction(value);
                  }}
                />
                <Button
                  title="Chấp nhận và xử lý"
                  onPress={() =>
                    setDecision({
                      title: "Xử lý báo cáo",
                      reason: true,
                      run: (note) =>
                        api.admin.resolveReport(selected.id, {
                          resolution_note: note,
                          action: resolutionAction,
                        }),
                    })
                  }
                />
                <Button
                  title="Không chấp nhận báo cáo"
                  secondary
                  onPress={() =>
                    setDecision({
                      title: "Không chấp nhận báo cáo",
                      reason: true,
                      run: (note) =>
                        api.admin.rejectReport(selected.id, {
                          resolution_note: note,
                        }),
                    })
                  }
                />
              </>
            )}
          </>
        )}
      </Sheet>
      <DecisionSheet
        key={decision?.title}
        decision={decision}
        onClose={() => {
          setDecision(null);
          setSelected(null);
        }}
      />
    </AdminList>
  );
}
