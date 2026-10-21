import { Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import {
  REPORT_REASON_LABELS,
  REPORT_STATUS_LABELS,
  formatDateTime,
} from "@remarket/shared";
import { api } from "../services/runtime";
import { useSession } from "../services/session-context";
import {
  EmptyState,
  Feedback,
  LoginPrompt,
  Screen,
  styles,
} from "../components/ui";
export default function MyReports() {
  const { user } = useSession();
  const query = useQuery({
    queryKey: ["reports", user?.id],
    queryFn: api.reports.mine,
    enabled: !!user,
  });
  return (
    <Screen
      title="Báo cáo của tôi"
      titleCard
      description="Theo dõi trạng thái xử lý những báo cáo bạn đã gửi."
    >
      {!user ? (
        <LoginPrompt />
      ) : (
        <>
          <Feedback
            loading={query.isPending}
            error={query.error}
            retry={() => {
              void query.refetch();
            }}
          />
          {query.data?.items.length === 0 && (
            <EmptyState title="Bạn chưa gửi báo cáo nào" />
          )}
          {query.data?.items.map((item) => (
            <View key={item.id} style={styles.card}>
              <Text style={styles.heading}>{item.target_label}</Text>
              <Text style={styles.text}>
                {REPORT_REASON_LABELS[item.reason]}
              </Text>
              <Text style={styles.muted}>
                {REPORT_STATUS_LABELS[item.status].label} ·{" "}
                {formatDateTime(item.created_at)}
              </Text>
              {item.description && (
                <Text style={styles.text}>{item.description}</Text>
              )}
              {item.resolution_note && (
                <Text style={styles.text}>Kết quả: {item.resolution_note}</Text>
              )}
            </View>
          ))}
        </>
      )}
    </Screen>
  );
}
