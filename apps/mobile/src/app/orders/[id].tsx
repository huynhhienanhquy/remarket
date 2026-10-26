import { useState } from "react";
import { Alert, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { ApiError } from "@remarket/api-client";
import type { OrderDetail as OrderDetailDto } from "@remarket/shared";
import {
  formatVnd,
  formatDateTime,
  validateReviewComment,
  ORDER_STATUS_LABELS,
  CONDITION_LABELS,
} from "@remarket/shared";
import { api } from "../../services/runtime";
import { useSession, queryClient } from "../../services/session-context";
import { MarketplaceImage } from "../../components/MarketplaceImage";
import {
  Screen,
  Field,
  Button,
  Feedback,
  LoginPrompt,
  useAction,
  styles,
  StatusBadge,
  colors,
} from "../../components/ui";

const actionLabels = {
  confirm: "Xác nhận đơn",
  cancel: "Hủy đơn",
  ship: "Đã gửi hàng",
  deliver: "Ghi nhận đã giao hàng",
  complete: "Hoàn tất",
} as const;
export default function OrderDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useSession();
  const action = useAction();
  const [reason, setReason] = useState("");
  const [carrier, setCarrier] = useState("");
  const [received, setReceived] = useState(false);
  const [paid, setPaid] = useState(false);
  const [rating, setRating] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const result = useQuery({
    queryKey: ["orders", id, user?.id],
    queryFn: () => api.orders.detail(id),
    enabled: !!user,
  });
  const order = result.data;
  if (!user)
    return (
      <Screen title="Chi tiết đơn">
        <LoginPrompt />
      </Screen>
    );
  return (
    <Screen title={order?.code ?? "Chi tiết đơn"}>
      <Feedback
        loading={result.isPending}
        error={result.error ?? action.error}
        retry={() => {
          void result.refetch();
        }}
      />
      {order && (
        <>
          <View style={styles.card}>
            <StatusBadge {...ORDER_STATUS_LABELS[order.status]} />
            <Text style={styles.label}>
              {order.role === "buyer" ? "Người bán" : "Người mua"}:{" "}
              {order.counterparty.name}
            </Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.heading}>Món đồ</Text>
            {order.items.map((item, index) => (
              <View
                key={item.id}
                style={{
                  flexDirection: "row",
                  gap: 12,
                  paddingTop: index ? 12 : 0,
                  borderTopWidth: index ? 1 : 0,
                  borderColor: colors.border,
                }}
              >
                <MarketplaceImage
                  uri={item.image_url ?? ""}
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: 8,
                    backgroundColor: colors.subtle,
                  }}
                />
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={styles.label}>{item.title_snapshot}</Text>
                  <Text style={styles.meta}>
                    {CONDITION_LABELS[item.condition_snapshot]}
                  </Text>
                  <Text style={[styles.label, { fontWeight: "700" }]}>
                    {formatVnd(item.price)}
                  </Text>
                </View>
              </View>
            ))}
          </View>
          <View style={styles.card}>
            <View style={[styles.row, { justifyContent: "space-between" }]}>
              <Text style={styles.muted}>Tiền hàng</Text>
              <Text style={styles.text}>{formatVnd(order.subtotal)}</Text>
            </View>
            <View style={[styles.row, { justifyContent: "space-between" }]}>
              <Text style={styles.muted}>Phí giao nhận</Text>
              <Text style={styles.text}>{formatVnd(order.shipping_fee)}</Text>
            </View>
            <View
              style={[
                styles.row,
                {
                  justifyContent: "space-between",
                  borderTopWidth: 1,
                  borderColor: colors.border,
                  paddingTop: 12,
                },
              ]}
            >
              <Text style={styles.label}>Tổng thanh toán</Text>
              <Text style={[styles.heading, { color: colors.green }]}>
                {formatVnd(order.total_amount)}
              </Text>
            </View>
          </View>
          <Text style={styles.muted}>
            {order.delivery_method === "COD"
              ? "Giao hàng, trả tiền mặt"
              : "Gặp trực tiếp"}{" "}
            · Tạo {formatDateTime(order.created_at)}
          </Text>
          {order.expires_at && order.status === "PENDING" && (
            <Text style={styles.muted}>
              Hạn người bán xác nhận: {formatDateTime(order.expires_at)}
            </Text>
          )}
          {order.cancellation_reason && (
            <Text style={styles.error}>
              Lý do hủy: {order.cancellation_reason}
            </Text>
          )}
          <View style={styles.card}>
            <Text style={styles.heading}>Giao nhận</Text>
            <Text style={styles.text}>
              {order.delivery.recipient_name} · {order.delivery.recipient_phone}
            </Text>
            <Text style={styles.text}>{order.delivery.delivery_address}</Text>
            <Text style={styles.muted}>
              {order.delivery.carrier} {order.delivery.tracking_code}
            </Text>
          </View>
          {order.allowed_actions.includes("cancel") && (
            <Field label="Lý do hủy" value={reason} onChangeText={setReason} />
          )}
          {order.role === "seller" &&
            order.allowed_actions.includes("ship") && (
              <>
                <Field
                  label="Đơn vị vận chuyển"
                  value={carrier}
                  onChangeText={setCarrier}
                />
                <Text style={styles.muted}>
                  Mã vận đơn sẽ được tạo tự động khi bạn xác nhận giao hàng.
                </Text>
              </>
            )}
          {order.role === "buyer" &&
            order.allowed_actions.includes("complete") && (
              <>
                <Button
                  title={
                    received ? "✓ Đã nhận đủ hàng" : "Xác nhận đã nhận đủ hàng"
                  }
                  secondary
                  onPress={() => setReceived(!received)}
                />
                <Button
                  title={paid ? "✓ Đã thanh toán" : "Xác nhận đã thanh toán"}
                  secondary
                  onPress={() => setPaid(!paid)}
                />
              </>
            )}
          <View style={styles.row}>
            {(Object.keys(actionLabels) as Array<keyof typeof actionLabels>)
              .filter((name) => order.allowed_actions.includes(name))
              .filter(
                (name) =>
                  name === "cancel" ||
                  (name === "complete"
                    ? order.role === "buyer"
                    : order.role === "seller"),
              )
              .map((name) => (
                <Button
                  key={name}
                  title={actionLabels[name]}
                  disabled={
                    action.pending ||
                    (name === "cancel" && !reason.trim()) ||
                    (name === "complete" && (!received || !paid))
                  }
                  onPress={() =>
                    Alert.alert(
                      actionLabels[name],
                      "Bạn xác nhận thực hiện thao tác này?",
                      [
                        { text: "Quay lại", style: "cancel" },
                        {
                          text: "Xác nhận",
                          onPress: () => {
                            void action.run(async () => {
                              try {
                                await api.orders.act(id, name, {
                                  expected_version: order.version,
                                  ...(name === "cancel" ? { reason } : {}),
                                  ...(name === "ship" ? { carrier } : {}),
                                  ...(name === "complete"
                                    ? {
                                        buyer_confirmed_received: received,
                                        buyer_confirmed_paid: paid,
                                      }
                                    : {}),
                                });
                              } catch (error) {
                                if (
                                  error instanceof ApiError &&
                                  [
                                    "VERSION_CONFLICT",
                                    "INVALID_ORDER_TRANSITION",
                                    "ORDER_EXPIRED",
                                  ].includes(error.code)
                                )
                                  await result.refetch();
                                throw error;
                              }
                              await queryClient.invalidateQueries();
                            });
                          },
                        },
                      ],
                    )
                  }
                />
              ))}
          </View>
          {order.review.can_review && (
            <View style={styles.card}>
              <Text style={styles.heading}>Đánh giá người bán</Text>
              <View style={styles.row}>
                {[1, 2, 3, 4, 5].map((value) => (
                  <Button
                    key={value}
                    title={`${value}★`}
                    secondary={rating !== value}
                    onPress={() => setRating(value)}
                  />
                ))}
              </View>
              <Field
                label="Nhận xét"
                maxLength={1000}
                value={comment}
                onChangeText={setComment}
              />
              <Button
                title="Gửi đánh giá"
                disabled={action.pending || rating === null}
                onPress={() => {
                  void action.run(async () => {
                    const error = validateReviewComment(comment);
                    if (error) throw new Error(error);
                    if (rating === null)
                      throw new Error("Vui lòng chọn số sao đánh giá.");
                    let review;
                    try {
                      review = await api.reviews.create(id, {
                        rating,
                        comment: comment.trim() || null,
                        expected_version: order.version,
                      });
                    } catch (error) {
                      if (
                        error instanceof ApiError &&
                        error.code === "REVIEW_NOT_ALLOWED"
                      )
                        await result.refetch();
                      throw error;
                    }
                    queryClient.setQueryData<OrderDetailDto>(
                      ["orders", id, user.id],
                      (current) =>
                        current
                          ? {
                              ...current,
                              allowed_actions: current.allowed_actions.filter(
                                (name) => name !== "review",
                              ),
                              review: {
                                can_review: false,
                                reason: "Bạn đã đánh giá đơn hàng này.",
                                existing: review,
                              },
                            }
                          : current,
                    );
                    await queryClient.invalidateQueries();
                  });
                }}
              />
            </View>
          )}
          {order.review.existing && (
            <Text style={styles.text}>
              Đánh giá: {order.review.existing.rating}★ ·{" "}
              {order.review.existing.comment}
            </Text>
          )}
          {!order.review.can_review && order.review.reason && (
            <Text style={styles.muted}>{order.review.reason}</Text>
          )}
          <Text style={styles.error}>{order.completion_block_reason}</Text>
          {order.conversation_id && (
            <Button
              title="Mở hội thoại"
              secondary
              onPress={() => router.push(`/messages/${order.conversation_id}`)}
            />
          )}
          <Button
            title="Yêu cầu hỗ trợ"
            secondary
            onPress={() =>
              router.push({
                pathname: "/support/new",
                params: { order_id: id },
              })
            }
          />
          {order.status_history.map((entry, index) => (
            <Text key={index} style={styles.muted}>
              {ORDER_STATUS_LABELS[entry.to_status].label} ·{" "}
              {formatDateTime(entry.created_at)}
              {entry.actor_name ? ` · ${entry.actor_name}` : ""}
              {entry.reason ? ` · ${entry.reason}` : ""}
            </Text>
          ))}
        </>
      )}
    </Screen>
  );
}
