import { useState } from "react";
import { Text, View } from "react-native";
import { formatDateTime } from "@remarket/shared";
import { api } from "../../services/runtime";
import { SelectField } from "../../components/SelectField";
import { Button, styles } from "../../components/ui";
import {
  AdminList,
  DecisionSheet,
  useAdminList,
} from "../../features/admin/common";
import type { Decision } from "../../features/admin/common";

export default function EmailVerifications() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<"PENDING" | "APPROVED" | "ALL">(
    "PENDING",
  );
  const [decision, setDecision] = useState<Decision | null>(null);
  const input = { page, status };
  const query = useAdminList("email-verifications", input, () =>
    api.admin.emailVerifications(input),
  );
  return (
    <AdminList
      title="Xác minh email"
      query={query}
      page={page}
      onPage={setPage}
      filters={
        <SelectField
          label="Trạng thái"
          value={status}
          items={[
            { value: "PENDING", label: "Chờ xác minh" },
            { value: "APPROVED", label: "Đã xác minh" },
            { value: "ALL", label: "Tất cả" },
          ]}
          onChange={(value) => {
            if (value === "PENDING" || value === "APPROVED" || value === "ALL")
              setStatus(value);
            setPage(1);
          }}
        />
      }
    >
      {query.data?.items.map((item) => (
        <View key={item.id} style={styles.card}>
          <Text style={styles.heading}>{item.user.full_name}</Text>
          <Text style={styles.text}>{item.user.email}</Text>
          <Text style={styles.muted}>
            Yêu cầu: {formatDateTime(item.requested_at)}
          </Text>
          {item.approved_at ? (
            <Text style={styles.text}>
              Đã xác minh {formatDateTime(item.approved_at)}
            </Text>
          ) : (
            <Button
              title="Xác nhận email"
              disabled={item.user.status !== "ACTIVE"}
              onPress={() =>
                setDecision({
                  title: "Xác nhận email người dùng",
                  description: item.user.email,
                  run: () => api.admin.approveEmailVerification(item.id),
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
