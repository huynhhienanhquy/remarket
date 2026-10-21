import { adminNavigation } from "../../features/admin/navigation";
import { useState } from "react";
import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import {
  formatVnd,
  PRODUCT_STATUS_LABELS,
  PRODUCT_STATUSES,
} from "@remarket/shared";
import { api } from "../../services/runtime";
import { useSession } from "../../services/session-context";
import {
  Button,
  Feedback,
  Field,
  MenuRow,
  Screen,
  styles,
} from "../../components/ui";

const sections = adminNavigation.filter((item) => item.path !== "/admin");
function dateOnly(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function initialPeriod() {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - 29);
  return { from: dateOnly(from), to: dateOnly(to) };
}
export default function AdminDashboard() {
  const { user } = useSession();
  const router = useRouter();
  const [period, setPeriod] = useState(initialPeriod);
  const [draft, setDraft] = useState(period);
  const [error, setError] = useState<string>();
  const result = useQuery({
    queryKey: ["admin", "dashboard", user?.id, period],
    queryFn: () => api.admin.dashboard(period.from, period.to),
  });
  const data = result.data;
  return (
    <Screen
      title="Tổng quan"
      titleCard
      description="Theo dõi hoạt động và các nội dung cần xử lý trên ReMarket."
      onRefresh={() => {
        void result.refetch();
      }}
      refreshing={result.isRefetching}
    >
      <View style={styles.card}>
        <Text style={styles.heading}>Khoảng thống kê</Text>
        <Field
          label="Từ ngày (YYYY-MM-DD)"
          value={draft.from}
          onChangeText={(from) => setDraft({ ...draft, from })}
        />
        <Field
          label="Đến ngày (YYYY-MM-DD)"
          value={draft.to}
          onChangeText={(to) => setDraft({ ...draft, to })}
        />
        {error && <Text style={styles.error}>{error}</Text>}
        <Button
          title="Áp dụng"
          secondary
          onPress={() => {
            if (
              !/^\d{4}-\d{2}-\d{2}$/.test(draft.from) ||
              !/^\d{4}-\d{2}-\d{2}$/.test(draft.to) ||
              draft.from > draft.to
            ) {
              setError("Khoảng ngày không hợp lệ.");
              return;
            }
            setPeriod(draft);
            setError(undefined);
          }}
        />
      </View>
      <Feedback
        loading={result.isPending}
        error={result.error}
        retry={() => {
          void result.refetch();
        }}
      />
      {data && (
        <>
          <View style={styles.card}>
            {[
              ["Tổng người dùng", data.total_users],
              ["Người dùng mới trong kỳ", data.new_users_in_period],
              ["Tin chờ duyệt", data.pending_products],
              ["Đơn hoàn tất trong kỳ", data.completed_orders_in_period],
              [
                "Giá trị giao dịch hoàn tất",
                formatVnd(data.completed_order_value_in_period),
              ],
              ["Báo cáo chờ xử lý", data.pending_reports],
              ["Yêu cầu chưa giải quyết", data.unresolved_tickets],
              ["Tin bị hạn chế", data.blocked_products],
            ].map(([label, value]) => (
              <View
                key={label}
                style={[styles.row, { justifyContent: "space-between" }]}
              >
                <Text style={styles.muted}>{label}</Text>
                <Text style={styles.heading}>{value}</Text>
              </View>
            ))}
          </View>
          <View style={styles.card}>
            <Text style={styles.heading}>Trạng thái tin đăng</Text>
            {PRODUCT_STATUSES.map((value) => (
              <Text key={value} style={styles.text}>
                {PRODUCT_STATUS_LABELS[value].label}:{" "}
                {data.products_by_status[value]}
              </Text>
            ))}
          </View>
          <View style={styles.card}>
            <Text style={styles.heading}>Tin mới chờ duyệt</Text>
            {data.pending_products_queue.map((item) => (
              <MenuRow
                key={item.id}
                title={item.title}
                description={item.seller.name}
                icon="pricetag-outline"
                onPress={() =>
                  router.push({
                    pathname: "/admin/products",
                    params: { selected: item.id },
                  })
                }
              />
            ))}
            {!data.pending_products_queue.length && (
              <Text style={styles.muted}>Không có tin chờ duyệt.</Text>
            )}
          </View>
          <View style={styles.card}>
            <Text style={styles.heading}>Yêu cầu hỗ trợ mới</Text>
            {data.open_tickets_queue.map((item) => (
              <MenuRow
                key={item.id}
                title={item.subject}
                description={item.code}
                icon="help-circle-outline"
                onPress={() =>
                  router.push({
                    pathname: "/admin/support",
                    params: { selected: item.id },
                  })
                }
              />
            ))}
            {!data.open_tickets_queue.length && (
              <Text style={styles.muted}>Không có yêu cầu mới.</Text>
            )}
          </View>
        </>
      )}
      <View style={styles.card}>
        {sections.map((section) => (
          <MenuRow
            key={section.path}
            title={section.title}
            icon={section.icon}
            onPress={() => router.push(section.path)}
          />
        ))}
      </View>
      <Button
        title="Về marketplace"
        secondary
        onPress={() => router.replace("/account")}
      />
    </Screen>
  );
}
