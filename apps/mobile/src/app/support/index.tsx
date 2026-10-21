import { TICKET_STATUSES, TICKET_STATUS_LABELS } from "@remarket/shared";
import { SelectField } from "../../components/SelectField";
import { useState } from "react";
import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../services/runtime";
import { useSession } from "../../services/session-context";
import {
  Screen,
  Button,
  Feedback,
  LoginPrompt,
  styles,
  EmptyState,
  Pagination,
} from "../../components/ui";
export default function Support() {
  const { user } = useSession();
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const result = useQuery({
    queryKey: ["support", user?.id, page, status],
    enabled: !!user,
    queryFn: () =>
      api.support.list({
        page,
        status: TICKET_STATUSES.find((value) => value === status),
      }),
  });
  return (
    <Screen
      title="Trung tâm hỗ trợ"
      titleCard
      description="Theo dõi yêu cầu và nhận hỗ trợ từ ReMarket."
    >
      {!user ? (
        <LoginPrompt />
      ) : (
        <>
          <SelectField
            label="Trạng thái yêu cầu"
            value={status}
            items={[
              { value: "", label: "Tất cả" },
              ...TICKET_STATUSES.map((value) => ({
                value,
                label: TICKET_STATUS_LABELS[value].label,
              })),
            ]}
            onChange={(value) => {
              setStatus(value);
              setPage(1);
            }}
          />
          <Button
            title="Tạo yêu cầu hỗ trợ"
            onPress={() => router.push("/support/new")}
          />
          <Feedback
            loading={result.isPending}
            error={result.error}
            retry={() => {
              void result.refetch();
            }}
          />
          {result.data?.items.map((ticket) => (
            <View key={ticket.id} style={styles.card}>
              <Text style={styles.heading}>{ticket.subject}</Text>
              <Text style={styles.muted}>
                {ticket.code} · {TICKET_STATUS_LABELS[ticket.status].label}
              </Text>
              <Button
                title="Xem yêu cầu"
                secondary
                onPress={() => router.push(`/support/${ticket.id}`)}
              />
            </View>
          ))}
          {result.data?.items.length === 0 && (
            <EmptyState title="Chưa có yêu cầu hỗ trợ" />
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
