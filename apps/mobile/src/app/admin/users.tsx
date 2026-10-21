import { useState } from "react";
import { Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import {
  USER_STATUSES,
  USER_ROLES,
  USER_STATUS_LABELS,
  formatDateTime,
} from "@remarket/shared";
import { api } from "../../services/runtime";
import { SelectField } from "../../components/SelectField";
import { Sheet } from "../../components/Sheet";
import { Button, Feedback, styles } from "../../components/ui";
import {
  AdminList,
  AdminSearch,
  AdvancedFilters,
  DecisionSheet,
  moderationFields,
  useAdminList,
} from "../../features/admin/common";
import type { Decision } from "../../features/admin/common";

export default function AdminUsers() {
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [role, setRole] = useState("");
  const [advanced, setAdvanced] = useState<Record<string, string>>({});
  const [id, setId] = useState<string>();
  const [decision, setDecision] = useState<Decision | null>(null);
  const input = {
    ...advanced,
    page,
    q: q || undefined,
    status: USER_STATUSES.find((value) => value === status),
    role: USER_ROLES.find((value) => value === role),
  };
  const query = useAdminList("users", input, () => api.admin.users(input));
  const detail = useQuery({
    queryKey: ["admin", "user", id],
    queryFn: () => api.admin.user(id!),
    enabled: !!id,
  });
  const user = detail.data;
  return (
    <AdminList
      title="Người dùng"
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
              ...USER_STATUSES.map((value) => ({
                value,
                label: USER_STATUS_LABELS[value].label,
              })),
            ]}
            onChange={(value) => {
              setStatus(value);
              setPage(1);
            }}
          />
          <SelectField
            label="Vai trò"
            value={role}
            items={[
              { value: "", label: "Tất cả" },
              { value: "USER", label: "Thành viên" },
              { value: "ADMIN", label: "Quản trị viên" },
            ]}
            onChange={(value) => {
              setRole(value);
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
          <Text style={styles.heading}>{item.full_name}</Text>
          <Text style={styles.muted}>{item.email}</Text>
          <Text style={styles.text}>
            {USER_STATUS_LABELS[item.status].label} ·{" "}
            {item.role === "ADMIN" ? "Quản trị viên" : "Thành viên"}
          </Text>
          <Button title="Xem hồ sơ" secondary onPress={() => setId(item.id)} />
        </View>
      ))}
      <Sheet
        visible={!!id && !decision}
        title="Thông tin người dùng"
        onClose={() => setId(undefined)}
      >
        <Feedback
          loading={detail.isPending}
          error={detail.error}
          retry={() => {
            void detail.refetch();
          }}
        />
        {user && (
          <>
            <Text style={styles.heading}>{user.full_name}</Text>
            <Text style={styles.text}>{user.email}</Text>
            <Text style={styles.text}>
              {user.phone ?? "Chưa có số điện thoại"}
            </Text>
            <Text style={styles.text}>
              {user.province_label} · {user.default_address}
            </Text>
            <Text style={styles.muted}>
              Tham gia: {formatDateTime(user.created_at)}
            </Text>
            <Text style={styles.muted}>
              {user.email_verified_at
                ? "Email đã xác minh"
                : "Chưa xác minh email"}
            </Text>
            {user.lock_reason && (
              <Text style={styles.error}>Lý do khóa: {user.lock_reason}</Text>
            )}
            <Button
              title={
                user.status === "ACTIVE"
                  ? "Khóa tài khoản"
                  : "Mở khóa tài khoản"
              }
              danger={user.status === "ACTIVE"}
              onPress={() =>
                setDecision(
                  user.status === "ACTIVE"
                    ? {
                        title: "Khóa tài khoản",
                        reason: true,
                        danger: true,
                        run: (note) => api.admin.lockUser(user.id, note),
                      }
                    : {
                        title: "Mở khóa tài khoản",
                        run: () => api.admin.unlockUser(user.id),
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
        onClose={() => setDecision(null)}
      />
    </AdminList>
  );
}
