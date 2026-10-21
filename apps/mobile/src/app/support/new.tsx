import { useState } from "react";
import { View } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import {
  TICKET_TYPES,
  TICKET_TYPE_LABELS,
  validateSupportMessage,
  validateSupportSubject,
} from "@remarket/shared";
import { SelectField } from "../../components/SelectField";
import type { TicketType } from "@remarket/shared";
import { api } from "../../services/runtime";
import { useSession } from "../../services/session-context";
import {
  Screen,
  Field,
  Button,
  Feedback,
  LoginPrompt,
  useAction,
  styles,
} from "../../components/ui";
export default function NewSupport() {
  const { user } = useSession();
  const router = useRouter();
  const { order_id } = useLocalSearchParams<{ order_id?: string }>();
  const action = useAction();
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [type, setType] = useState<TicketType>(
    order_id ? "ORDER_PROBLEM" : "ACCOUNT",
  );
  const [selectedOrder, setSelectedOrder] = useState(order_id ?? "");
  const needsOrder = type === "ORDER_PROBLEM";
  const buyerOrders = useInfiniteQuery({
    queryKey: ["orders", "support-picker", "buyer", user?.id],
    enabled: !!user && needsOrder,
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      api.orders.list({ role: "buyer", page: pageParam }),
    getNextPageParam: (last) =>
      last.meta.page < last.meta.total_pages ? last.meta.page + 1 : undefined,
  });
  const sellerOrders = useInfiniteQuery({
    queryKey: ["orders", "support-picker", "seller", user?.id],
    enabled: !!user && needsOrder,
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      api.orders.list({ role: "seller", page: pageParam }),
    getNextPageParam: (last) =>
      last.meta.page < last.meta.total_pages ? last.meta.page + 1 : undefined,
  });
  const prefill = useQuery({
    queryKey: ["orders", order_id, user?.id],
    enabled: !!user && needsOrder && !!order_id,
    queryFn: () => api.orders.detail(order_id!),
  });
  const orders = Array.from(
    new Map(
      [
        ...(buyerOrders.data?.pages.flatMap((page) => page.items) ?? []),
        ...(sellerOrders.data?.pages.flatMap((page) => page.items) ?? []),
        ...(prefill.data ? [prefill.data] : []),
      ].map((order) => [order.id, order]),
    ).values(),
  );
  return (
    <Screen title="Yêu cầu hỗ trợ">
      {!user ? (
        <LoginPrompt />
      ) : (
        <>
          <Field label="Tiêu đề" value={subject} onChangeText={setSubject} />
          <View style={styles.row}>
            {TICKET_TYPES.map((choice) => (
              <Button
                key={choice}
                title={TICKET_TYPE_LABELS[choice]}
                secondary={choice !== type}
                onPress={() => setType(choice)}
              />
            ))}
          </View>
          {needsOrder && (
            <>
              <SelectField
                label="Đơn cần hỗ trợ"
                value={selectedOrder}
                items={orders.map((order) => ({
                  value: order.id,
                  label: `${order.code} · ${order.counterparty.name}`,
                }))}
                onChange={setSelectedOrder}
              />
              <Feedback
                error={buyerOrders.error ?? sellerOrders.error ?? prefill.error}
              />
              {(buyerOrders.hasNextPage || sellerOrders.hasNextPage) && (
                <Button
                  title="Tải thêm đơn hàng"
                  secondary
                  onPress={() => {
                    if (buyerOrders.hasNextPage)
                      void buyerOrders.fetchNextPage();
                    if (sellerOrders.hasNextPage)
                      void sellerOrders.fetchNextPage();
                  }}
                />
              )}
            </>
          )}
          <Field
            label="Nội dung"
            value={message}
            onChangeText={setMessage}
            multiline
          />
          <Feedback error={action.error} />
          <Button
            title="Gửi yêu cầu"
            disabled={action.pending}
            onPress={() => {
              void action.run(async () => {
                const error =
                  validateSupportSubject(subject) ||
                  validateSupportMessage(message);
                if (error) throw new Error(error);
                if (needsOrder && !selectedOrder)
                  throw new Error("Hãy chọn đơn hàng cần hỗ trợ.");
                const ticket = await api.support.create({
                  subject,
                  message,
                  type,
                  ...(needsOrder && selectedOrder
                    ? { order_id: selectedOrder }
                    : {}),
                });
                router.replace(`/support/${ticket.id}`);
              });
            }}
          />
        </>
      )}
    </Screen>
  );
}
