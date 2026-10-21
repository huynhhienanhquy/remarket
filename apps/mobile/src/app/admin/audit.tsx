import { useState } from "react";
import { Text, View } from "react-native";
import { formatDateTime } from "@remarket/shared";
import { api } from "../../services/runtime";
import { styles } from "../../components/ui";
import {
  AdminList,
  AdvancedFilters,
  periodFields,
  useAdminList,
} from "../../features/admin/common";

export default function AdminAudit() {
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const input = { ...filters, page };
  const query = useAdminList("audit", input, () => api.admin.audit(input));
  return (
    <AdminList
      title="Nhật ký quản trị"
      query={query}
      page={page}
      onPage={setPage}
      filters={
        <AdvancedFilters
          fields={[
            { key: "action", label: "Hành động" },
            { key: "entity_type", label: "Loại đối tượng" },
            { key: "entity_id", label: "Mã đối tượng" },
            { key: "actor_id", label: "Mã người thực hiện" },
            ...periodFields,
          ]}
          onApply={(value) => {
            setFilters(value);
            setPage(1);
          }}
        />
      }
    >
      {query.data?.items.map((item) => (
        <View key={item.id} style={styles.card}>
          <Text style={styles.heading}>{item.action}</Text>
          <Text style={styles.text}>
            {item.actor_name ?? "Hệ thống"} · {item.entity_type}
          </Text>
          <Text selectable style={styles.meta}>
            {item.entity_id}
          </Text>
          <Text style={styles.muted}>{formatDateTime(item.created_at)}</Text>
          {item.reason && <Text style={styles.text}>{item.reason}</Text>}
          <Text selectable style={styles.meta}>
            {JSON.stringify(item.metadata, null, 2)}
          </Text>
        </View>
      ))}
    </AdminList>
  );
}
