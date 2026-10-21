import { useState } from "react";
import { Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import {
  ORDER_STATUS_LABELS,
  TICKET_STATUSES,
  TICKET_STATUS_LABELS,
  TICKET_TYPES,
  TICKET_TYPE_LABELS,
  formatDateTime,
  formatVnd,
  validateSupportMessage,
} from "@remarket/shared";
import { api } from "../../services/runtime";
import { queryClient } from "../../services/session-context";
import { SelectField } from "../../components/SelectField";
import { Sheet } from "../../components/Sheet";
import {
  Button,
  Feedback,
  Field,
  styles,
  useAction,
} from "../../components/ui";
import {
  AdminList,
  AdvancedFilters,
  DecisionSheet,
  periodFields,
  useAdminList,
} from "../../features/admin/common";
import type { Decision } from "../../features/admin/common";

export default function AdminSupport() {
  const params = useLocalSearchParams<{ selected?: string }>();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [type, setType] = useState("");
  const [advanced, setAdvanced] = useState<Record<string, string>>({});
  const [id, setId] = useState(params.selected);
  const [reply, setReply] = useState("");
  const [decision, setDecision] = useState<Decision | null>(null);
  const [cancel, setCancel] = useState(false);
  const [reason, setReason] = useState("");
  const [deliveryOutcome, setDeliveryOutcome] = useState<
    "NOT_DELIVERED" | "RETURNED"
  >("NOT_DELIVERED");
  const [paymentResolution, setPaymentResolution] = useState("");
  const action = useAction();
  const input = {
    ...advanced,
    page,
    status: TICKET_STATUSES.find((value) => value === status),
    type: TICKET_TYPES.find((value) => value === type),
  };
  const query = useAdminList("support", input, () => api.admin.tickets(input));
  const detail = useQuery({
    queryKey: ["admin", "ticket", id],
    queryFn: () => api.admin.ticket(id!),
    enabled: !!id,
  });
  const ticket = detail.data;
  const afterDelivery =
    ticket?.order?.status === "SHIPPING" ||
    ticket?.order?.status === "DELIVERED";
  const canCancel =
    ticket?.type === "ORDER_PROBLEM" &&
    ticket.order &&
    !["COMPLETED", "CANCELLED"].includes(ticket.order.status) &&
    (!afterDelivery ||
      (["RESOLVED", "CLOSED"].includes(ticket.status) &&
        !!ticket.resolution_note));
  const update = async (
    input: Parameters<typeof api.admin.updateTicket>[1],
  ) => {
    if (!id) return;
    await api.admin.updateTicket(id, input);
    await queryClient.invalidateQueries();
  };
  return (
    <AdminList
      title="Hỗ trợ"
      query={query}
      page={page}
      onPage={setPage}
      filters={
        <>
          <SelectField
            label="Trạng thái"
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
          <SelectField
            label="Loại yêu cầu"
            value={type}
            items={[
              { value: "", label: "Tất cả" },
              ...TICKET_TYPES.map((value) => ({
                value,
                label: TICKET_TYPE_LABELS[value],
              })),
            ]}
            onChange={(value) => {
              setType(value);
              setPage(1);
            }}
          />
          <AdvancedFilters
            fields={[
              {
                key: "assigned_admin_id",
                label: "Mã người phụ trách hoặc UNASSIGNED",
              },
              ...periodFields,
            ]}
            onApply={(value) => {
              setAdvanced(value);
              setPage(1);
            }}
          />
        </>
      }
    >
      {query.data?.items.map((item) => (
        <View key={item.id} style={styles.card}>
          <Text style={styles.heading}>{item.subject}</Text>
          <Text style={styles.muted}>
            {item.code} · {TICKET_STATUS_LABELS[item.status].label}
          </Text>
          <Text style={styles.text}>
            {item.user.name} · {item.assigned_admin?.name ?? "Chưa phân công"}
          </Text>
          <Button
            title="Mở yêu cầu"
            secondary
            onPress={() => {
              setId(item.id);
              setReply("");
              setCancel(false);
            }}
          />
        </View>
      ))}
      <Sheet
        visible={!!id && !decision}
        title={
          ticket ? `${ticket.code} · ${ticket.subject}` : "Chi tiết hỗ trợ"
        }
        onClose={() => setId(undefined)}
      >
        <Feedback
          loading={detail.isPending}
          error={detail.error ?? action.error}
          retry={() => {
            void detail.refetch();
          }}
        />
        {ticket && (
          <>
            <Text style={styles.heading}>
              {TICKET_STATUS_LABELS[ticket.status].label}
            </Text>
            <Text style={styles.muted}>
              {ticket.user.name} · {TICKET_TYPE_LABELS[ticket.type]} ·{" "}
              {ticket.assigned_admin?.name ?? "Chưa phân công"}
            </Text>
            {ticket.resolution_note && (
              <View style={styles.card}>
                <Text style={styles.label}>Kết luận xử lý</Text>
                <Text style={styles.text}>{ticket.resolution_note}</Text>
              </View>
            )}
            {ticket.messages.map((message) => (
              <View key={message.id} style={styles.card}>
                <Text style={styles.label}>
                  {message.sender.name}{" "}
                  {message.sender.role === "ADMIN" ? "· Quản trị viên" : ""}
                </Text>
                <Text style={styles.text}>{message.message}</Text>
                <Text style={styles.meta}>
                  {formatDateTime(message.created_at)}
                </Text>
              </View>
            ))}
            {ticket.allowed_actions.includes("reply") && (
              <>
                <Field
                  label="Phản hồi người dùng"
                  value={reply}
                  onChangeText={setReply}
                  multiline
                  maxLength={5000}
                />
                <Button
                  title="Gửi phản hồi"
                  loading={action.pending}
                  disabled={!reply.trim()}
                  onPress={() => {
                    void action.run(async () => {
                      const error = validateSupportMessage(reply);
                      if (error) throw new Error(error);
                      await api.admin.replyTicket(ticket.id, reply.trim());
                      setReply("");
                      await queryClient.invalidateQueries();
                    }, "Đã gửi phản hồi.");
                  }}
                />
              </>
            )}
            {ticket.status !== "CLOSED" && !ticket.assigned_admin && (
              <Button
                title="Nhận xử lý"
                secondary
                disabled={action.pending}
                onPress={() => {
                  void action.run(
                    () => update({ assign: true }),
                    "Đã nhận xử lý.",
                  );
                }}
              />
            )}
            {ticket.allowed_actions.includes("progress") && (
              <Button
                title="Bắt đầu xử lý"
                secondary
                disabled={action.pending}
                onPress={() => {
                  void action.run(() =>
                    update({ status: "IN_PROGRESS", assign: true }),
                  );
                }}
              />
            )}
            {ticket.allowed_actions.includes("resolve") && (
              <Button
                title="Đánh dấu đã giải quyết"
                onPress={() =>
                  setDecision({
                    title: "Giải quyết yêu cầu",
                    reason: true,
                    run: (note) =>
                      update({ status: "RESOLVED", resolution_note: note }),
                  })
                }
              />
            )}
            {ticket.allowed_actions.includes("close") && (
              <Button
                title="Đóng yêu cầu"
                danger
                onPress={() =>
                  setDecision({
                    title: "Đóng yêu cầu",
                    description: "Yêu cầu đã đóng không thể mở lại.",
                    reason: true,
                    danger: true,
                    run: (note) =>
                      update({ status: "CLOSED", resolution_note: note }),
                  })
                }
              />
            )}
            {ticket.order && (
              <View style={styles.card}>
                <Text style={styles.heading}>Đơn {ticket.order.code}</Text>
                <Text style={styles.text}>
                  {ticket.order.buyer.name} → {ticket.order.seller.name}
                </Text>
                <Text style={styles.text}>
                  {ORDER_STATUS_LABELS[ticket.order.status].label} ·{" "}
                  {formatVnd(ticket.order.total_amount)}
                </Text>
                {ticket.order.items.map((item) => (
                  <Text key={item.id} style={styles.text}>
                    {item.title_snapshot} · {formatVnd(item.price)}
                  </Text>
                ))}
                {ticket.order.status_history.map((entry, index) => (
                  <Text key={index} style={styles.meta}>
                    {ORDER_STATUS_LABELS[entry.to_status].label} ·{" "}
                    {formatDateTime(entry.created_at)} · {entry.reason}
                  </Text>
                ))}
                {afterDelivery &&
                  !canCancel &&
                  !["COMPLETED", "CANCELLED"].includes(ticket.order.status) && (
                    <Text style={styles.muted}>
                      Cần giải quyết yêu cầu và ghi kết luận trước khi hủy đơn
                      đang/đã giao.
                    </Text>
                  )}
                {canCancel && (
                  <Button
                    title="Hủy đơn qua hỗ trợ"
                    danger
                    onPress={() => {
                      setCancel(!cancel);
                      setReason("");
                      setPaymentResolution("");
                    }}
                  />
                )}
                {canCancel && cancel && (
                  <>
                    <Field
                      label="Lý do hủy đơn"
                      value={reason}
                      onChangeText={setReason}
                      multiline
                      maxLength={1000}
                    />
                    {afterDelivery && (
                      <>
                        <SelectField
                          label="Kết quả giao hàng"
                          value={deliveryOutcome}
                          items={[
                            {
                              value: "NOT_DELIVERED",
                              label: "Chưa giao cho người mua",
                            },
                            { value: "RETURNED", label: "Hàng đã trả lại" },
                          ]}
                          onChange={(value) => {
                            if (
                              value === "NOT_DELIVERED" ||
                              value === "RETURNED"
                            )
                              setDeliveryOutcome(value);
                          }}
                        />
                        <Field
                          label="Thỏa thuận thanh toán"
                          value={paymentResolution}
                          onChangeText={setPaymentResolution}
                          multiline
                          maxLength={1000}
                        />
                      </>
                    )}
                    <Button
                      title="Xác nhận hủy đơn"
                      danger
                      disabled={
                        !reason.trim() ||
                        (afterDelivery && !paymentResolution.trim())
                      }
                      onPress={() =>
                        setDecision({
                          title: "Hủy đơn hàng",
                          description:
                            "Đơn sẽ chuyển sang Đã hủy. Hệ thống ghi nhận thỏa thuận và không tự chuyển tiền.",
                          danger: true,
                          run: async () => {
                            await api.admin.cancelOrder(ticket.order!.id, {
                              expected_version: ticket.order!.version,
                              reason: reason.trim(),
                              ticket_id: ticket.id,
                              ...(afterDelivery
                                ? {
                                    delivery_outcome: deliveryOutcome,
                                    payment_resolution:
                                      paymentResolution.trim(),
                                  }
                                : {}),
                            });
                            setCancel(false);
                          },
                        })
                      }
                    />
                  </>
                )}
              </View>
            )}
          </>
        )}
      </Sheet>
      <DecisionSheet
        key={decision?.title}
        decision={decision}
        onClose={() => setDecision(null)}
      />
    </AdminList>
  );
}
