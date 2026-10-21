import { useState } from "react";
import { Text, View } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import {
  formatVnd,
  formatDateTime,
  ORDER_STATUSES,
  ORDER_STATUS_LABELS,
} from "@remarket/shared";
import { SelectField } from "../../components/SelectField";
import { api } from "../../services/runtime";
import { useSession } from "../../services/session-context";
import {
  Screen,
  Button,
  Feedback,
  LoginPrompt,
  Pagination,
  EmptyState,
  StatusBadge,
  styles,
} from "../../components/ui";
export default function Orders() {
  const router = useRouter();
  const params = useLocalSearchParams<{ role?: string }>();
  const { user } = useSession();
  const [role, setRole] = useState<"buyer" | "seller">(
    params.role === "seller" ? "seller" : "buyer",
  );
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const result = useQuery({
    queryKey: ["orders", user?.id, role, page, status],
    queryFn: () => api.orders.list({ role, page, status: status || undefined }),
    enabled: !!user,
  });
  return (
    <Screen
      title={role === "buyer" ? "Đơn mua" : "Đơn bán"}
      titleCard
      description={
        role === "buyer"
          ? "Theo dõi các món đồ bạn đã đặt mua."
          : "Quản lý đơn hàng và giao nhận với người mua."
      }
    >
      {!user ? (
        <LoginPrompt />
      ) : (
        <>
          <View style={styles.row}>
            <Button
              title="Đơn mua"
              secondary={role !== "buyer"}
              onPress={() => {
                setRole("buyer");
                setPage(1);
              }}
            />
            <Button
              title="Đơn bán"
              secondary={role !== "seller"}
              onPress={() => {
                setRole("seller");
                setPage(1);
              }}
            />
          </View>
          <SelectField
            label="Trạng thái đơn"
            value={status}
            items={[
              { value: "", label: "Tất cả" },
              ...ORDER_STATUSES.map((value) => ({
                value,
                label: ORDER_STATUS_LABELS[value].label,
              })),
            ]}
            onChange={(value) => {
              setStatus(value);
              setPage(1);
            }}
          />
          <Feedback
            loading={result.isPending}
            error={result.error}
            retry={() => {
              void result.refetch();
            }}
          />
          {result.data?.items.map((order) => (
            <View key={order.id} style={styles.card}>
              <Text style={styles.heading}>{order.code}</Text>
              <StatusBadge {...ORDER_STATUS_LABELS[order.status]} />
              <Text style={styles.text}>{order.counterparty.name}</Text>
              <Text style={[styles.heading, { fontSize: 18 }]}>
                {formatVnd(order.total_amount)}
              </Text>
              <Text style={styles.muted}>
                {order.delivery_method === "COD"
                  ? "Giao hàng COD"
                  : "Gặp trực tiếp"}{" "}
                · {formatDateTime(order.created_at)}
              </Text>
              <Button
                title="Xem chi tiết"
                secondary
                onPress={() => router.push(`/orders/${order.id}`)}
              />
            </View>
          ))}
          {result.data?.items.length === 0 && (
            <EmptyState
              icon="receipt-outline"
              title="Chưa có đơn hàng"
              description="Các đơn hàng của bạn sẽ xuất hiện tại đây."
            />
          )}
          {result.data && (
            <Pagination
              page={page}
              total={result.data.meta.total}
              pageSize={result.data.meta.page_size}
              onChange={setPage}
            />
          )}
        </>
      )}
    </Screen>
  );
}
