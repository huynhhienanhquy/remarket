import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useNetInfo } from "@react-native-community/netinfo";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { formatRelative } from "@remarket/shared";
import { SelectField } from "../components/SelectField";
import { Sheet } from "../components/Sheet";
import type { Notification } from "@remarket/shared";
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
  const [selected, setSelected] = useState<Notification | null>(null);
  const action = useAction();
  const network = useNetInfo();
  const offline =
    network.isConnected === false || network.isInternetReachable === false;
  const result = useQuery({
    queryKey: ["notifications", user?.id, page, unread],
    enabled: !!user,
    queryFn: () => api.notifications.list({ page, unread }),
    refetchInterval: 15_000,
  });
  return (
    <Screen
      title="Thông báo"
      titleCard
      description="Cập nhật về tin đăng, đơn hàng và hoạt động tài khoản của bạn."
      onRefresh={
        user
          ? () => {
              void result.refetch();
            }
          : undefined
      }
      refreshing={result.isRefetching}
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
            disabled={offline || action.pending || !result.data?.meta.unread}
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
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityLabel={`${item.title}${item.read_at ? "" : ", chưa đọc"}`}
              disabled={offline || action.pending}
              onPress={() => {
                void action.run(async () => {
                  if (!item.read_at) await api.notifications.markRead(item.id);
                  await queryClient.invalidateQueries({
                    queryKey: ["notifications"],
                  });
                  const route = notificationRoute(
                    item.reference_type,
                    item.reference_id,
                    user,
                  );
                  if (route)
                    router.push(route as Parameters<typeof router.push>[0]);
                  else setSelected(item);
                });
              }}
              style={[
                styles.card,
                {
                  borderRadius: 16,
                  flexDirection: "row",
                  alignItems: "flex-start",
                  gap: 12,
                  borderColor: item.read_at ? colors.border : colors.green,
                },
              ]}
            >
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  backgroundColor: item.read_at ? colors.subtle : colors.soft,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons
                  name="notifications-outline"
                  size={20}
                  color={item.read_at ? colors.muted : colors.green}
                />
              </View>
              <View style={{ flex: 1, gap: 8 }}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "flex-start",
                    gap: 8,
                  }}
                >
                  <Text
                    style={[
                      styles.label,
                      { flex: 1, fontWeight: item.read_at ? "500" : "600" },
                    ]}
                  >
                    {item.title}
                  </Text>
                  {!item.read_at && (
                    <View
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 4,
                        marginTop: 6,
                        backgroundColor: colors.green,
                      }}
                    />
                  )}
                </View>
                <Text numberOfLines={2} style={styles.muted}>
                  {item.content}
                </Text>
                <Text style={styles.meta}>
                  {formatRelative(item.created_at)}
                </Text>
              </View>
            </Pressable>
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
      <Sheet
        visible={selected !== null}
        title={selected?.title ?? "Thông báo"}
        onClose={() => setSelected(null)}
      >
        <Text style={styles.text}>{selected?.content}</Text>
      </Sheet>
    </Screen>
  );
}
