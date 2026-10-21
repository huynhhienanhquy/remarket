import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { formatRelative } from "@remarket/shared";
import { MarketplaceImage } from "../../components/MarketplaceImage";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../services/runtime";
import { useSession } from "../../services/session-context";
import {
  Screen,
  Feedback,
  LoginPrompt,
  styles,
  colors,
  Pagination,
  EmptyState,
} from "../../components/ui";

export default function Messages() {
  const router = useRouter();
  const { user } = useSession();
  const [page, setPage] = useState(1);
  const result = useQuery({
    queryKey: ["chat", "inbox", user?.id, page],
    queryFn: () => api.chat.conversations(page),
    enabled: !!user,
  });
  return (
    <Screen
      title="Tin nhắn"
      titleCard
      description="Trao đổi với người mua và người bán về món đồ của bạn."
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
          <Feedback
            loading={result.isPending}
            error={result.error}
            retry={() => {
              void result.refetch();
            }}
          />
          {!!result.data?.items.length && (
            <View
              style={[
                styles.card,
                { borderRadius: 16, padding: 0, gap: 0, overflow: "hidden" },
              ]}
            >
              {result.data.items.map((thread, index) => (
                <Pressable
                  key={thread.id}
                  accessibilityRole="link"
                  accessibilityLabel={`Hội thoại với ${thread.counterparty.name}, ${thread.unread_count} tin chưa đọc`}
                  onPress={() => router.push(`/messages/${thread.id}`)}
                  style={({ pressed }) => ({
                    padding: 16,
                    borderTopWidth: index ? 1 : 0,
                    borderColor: colors.border,
                    backgroundColor:
                      pressed || thread.unread_count > 0
                        ? colors.soft
                        : colors.card,
                  })}
                >
                  <View style={{ flexDirection: "row", gap: 12 }}>
                    {thread.counterparty.avatar_url ? (
                      <MarketplaceImage
                        uri={thread.counterparty.avatar_url}
                        style={{ width: 44, height: 44, borderRadius: 22 }}
                      />
                    ) : (
                      <View
                        style={{
                          width: 44,
                          height: 44,
                          borderRadius: 22,
                          backgroundColor: colors.subtle,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Text style={[styles.label, { color: colors.green }]}>
                          {thread.counterparty.name.slice(0, 1).toUpperCase()}
                        </Text>
                      </View>
                    )}
                    <View style={{ flex: 1, gap: 4 }}>
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        <Text
                          numberOfLines={1}
                          style={[styles.label, { flex: 1, fontWeight: "600" }]}
                        >
                          {thread.counterparty.name}
                        </Text>
                        <Text style={styles.meta}>
                          {formatRelative(thread.updated_at)}
                        </Text>
                      </View>
                      {!!thread.product && (
                        <Text numberOfLines={1} style={styles.meta}>
                          {thread.product.title}
                        </Text>
                      )}
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        <Text
                          numberOfLines={1}
                          style={[
                            styles.muted,
                            {
                              flex: 1,
                              color: thread.unread_count
                                ? colors.text
                                : colors.muted,
                            },
                          ]}
                        >
                          {thread.last_message?.content ?? "Bắt đầu trò chuyện"}
                        </Text>
                        {thread.unread_count > 0 && (
                          <View
                            style={{
                              backgroundColor: colors.green,
                              minWidth: 20,
                              minHeight: 20,
                              borderRadius: 10,
                              paddingHorizontal: 5,
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            <Text
                              style={{
                                fontSize: 11,
                                lineHeight: 16,
                                color: colors.card,
                              }}
                            >
                              {thread.unread_count > 99
                                ? "99+"
                                : thread.unread_count}
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>
                  </View>
                </Pressable>
              ))}
            </View>
          )}
          {result.data?.items.length === 0 && (
            <EmptyState
              icon="chatbubble-outline"
              title="Chưa có cuộc trò chuyện"
              description="Mở một món đồ và nhấn Nhắn tin để trao đổi với người bán."
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
