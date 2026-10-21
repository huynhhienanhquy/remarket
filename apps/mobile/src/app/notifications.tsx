import { useState } from "react";
import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { formatDateTime } from "@remarket/shared";
import { SelectField } from "../components/SelectField";
import { api } from "../services/runtime";
import { useSession, queryClient } from "../services/session-context";
import { notificationRoute } from "../services/linking";
import {
  Screen,
  Button,
  Feedback,
  LoginPrompt,
  useAction,
  EmptyState,
  Pagination,
  styles,
  colors,
} from "../components/ui";
export default function Notifications() {
  const { user } = useSession();
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [unread, setUnread] = useState(false);
  const action = useAction();
  const result = useQuery({
    queryKey: ["notifications", user?.id, page, unread],
    enabled: !!user,
    queryFn: () => api.notifications.list({ page, unread }),
  });
  return (
    <Screen
      title="Thông báo"
      titleCard
      description="Cập nhật về tin đăng, đơn hàng và hoạt động tài khoản của bạn."
    >
      {!user ? (
        <LoginPrompt />
      ) : (
        <>
          <SelectField
            label="Hiển thị"
            value={unread ? "unread" : "all"}
            items={[
              { value: "all", label: "Tất cả thông báo" },
              { value: "unread", label: "Chưa đọc" },
            ]}
            onChange={(value) => {
              setUnread(value === "unread");
              setPage(1);
            }}
          />
          <Feedback
            loading={result.isPending}
            error={result.error ?? action.error}
            retry={() => {
              void result.refetch();
            }}
          />
          <Button
            title="Đánh dấu tất cả đã đọc"
            disabled={action.pending || !result.data?.meta.unread}
            secondary
            onPress={() => {
              void action.run(async () => {
                await api.notifications.markAllRead();
                await queryClient.invalidateQueries({
                  queryKey: ["notifications"],
                });
              });
            }}
          />
          {result.data?.items.map((item) => (
            <View
              key={item.id}
              style={[
                styles.card,
                {
                  borderRadius: 16,
                  backgroundColor: item.read_at ? colors.card : colors.soft,
                },
              ]}
            >
              <Text style={[styles.label, { fontWeight: "600" }]}>
                {item.title}
              </Text>
              <Text style={styles.text}>{item.content}</Text>
              <Text style={styles.meta}>{formatDateTime(item.created_at)}</Text>
              <Button
                title="Xem cập nhật"
                disabled={action.pending}
                ghost
                onPress={() => {
                  void action.run(async () => {
                    await api.notifications.markRead(item.id);
                    await queryClient.invalidateQueries({
                      queryKey: ["notifications"],
                    });
                    const route = notificationRoute(
                      item.reference_type,
                      item.reference_id,
                    );
                    if (route)
                      router.push(route as Parameters<typeof router.push>[0]);
                  });
                }}
              />
            </View>
          ))}
          {result.data?.items.length === 0 && (
            <EmptyState
              title={unread ? "Bạn đã đọc hết thông báo" : "Chưa có thông báo"}
            />
          )}
          {result.data && (
            <Pagination
              page={page}
              total={result.data.meta.total}
              onChange={setPage}
            />
          )}
        </>
      )}
    </Screen>
  );
}
