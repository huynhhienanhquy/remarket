import { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { MarketplaceImage } from "../components/MarketplaceImage";
import { useRouter, useLocalSearchParams } from "expo-router";
import { randomUUID } from "expo-crypto";
import { useQuery } from "@tanstack/react-query";
import { ApiError } from "@remarket/api-client";
import { formatVnd, orderShippingFee, addVnd } from "@remarket/shared";
import type {
  CartView,
  CheckoutDeliveryInput,
  CheckoutResult,
} from "@remarket/shared";
import { api } from "../services/runtime";
import { useSession, queryClient } from "../services/session-context";
import { CheckoutIntent } from "../services/checkout-intent";
import { buildCheckoutPayload } from "../services/checkout-payload";
import {
  Screen,
  EmptyState,
  Field,
  Button,
  Feedback,
  LoginPrompt,
  useAction,
  styles,
} from "../components/ui";
export default function CheckoutScreen({
  buyNow = false,
}: {
  buyNow?: boolean;
}) {
  const { product_id } = useLocalSearchParams<{ product_id?: string }>();
  const { user } = useSession();
  const router = useRouter();
  const action = useAction();
  const result = useQuery({
    queryKey:
      buyNow && product_id
        ? ["checkout", user?.id, product_id]
        : ["cart", user?.id],
    queryFn: async (): Promise<CartView> => {
      if (!buyNow || !product_id) return api.cart.get();
      const product = await api.products.detail(product_id);
      return {
        total_items: 1,
        groups: [
          {
            seller: product.seller,
            items: [
              {
                product_id: product.id,
                title: product.title,
                price: product.price,
                image_url: product.image_url,
                condition: product.condition,
                status: product.status,
                province_label: product.province_label,
                delivery_method: product.delivery_method,
                shipping_fee: product.shipping_fee,
                available: product.capabilities.can_buy,
                unavailable_reason: product.capabilities.unavailable_reason,
              },
            ],
          },
        ],
      };
    },
    enabled: !!user,
  });
  const [excluded, setExcluded] = useState<string[]>([]);
  const [deliveries, setDeliveries] = useState<
    Record<string, Partial<CheckoutDeliveryInput>>
  >({});
  const intent = useRef(new CheckoutIntent(randomUUID));
  const [uncertain, setUncertain] = useState(false);
  const [orders, setOrders] = useState<CheckoutResult | null>(null);
  const selectedGroups = (result.data?.groups ?? [])
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) => item.available && !excluded.includes(item.product_id),
      ),
    }))
    .filter((group) => group.items.length);
  const subtotal = addVnd(
    ...selectedGroups.flatMap((group) => group.items.map((item) => item.price)),
  );
  const shippingTotal = addVnd(
    ...selectedGroups.map((group) =>
      orderShippingFee(
        deliveries[group.seller.id]?.method ??
          (["COD", "MEETUP"] as const).find((method) =>
            group.items.every(
              (item) =>
                item.delivery_method === "BOTH" ||
                item.delivery_method === method,
            ),
          ) ??
          "COD",
        group.items.map((item) => item.shipping_fee),
      ),
    ),
  );
  useEffect(() => {
    intent.current.clear();
    setExcluded([]);
    setDeliveries({});
    setUncertain(false);
    setOrders(null);
  }, [user?.id, product_id]);
  if (orders)
    return (
      <Screen title="Đặt hàng thành công">
        <EmptyState
          title="Đã gửi đơn đến người bán"
          description="Người bán sẽ xác nhận đơn. Bạn có thể theo dõi trong Đơn mua."
        />
        {orders.orders.map((order) => (
          <Button
            key={order.id}
            title={`Xem đơn ${order.code}`}
            onPress={() => router.replace(`/orders/${order.id}`)}
          />
        ))}
        <Button
          title="Tiếp tục khám phá"
          secondary
          onPress={() => router.replace("/")}
        />
      </Screen>
    );
  return (
    <Screen
      title={buyNow ? "Thanh toán" : "Giỏ hàng"}
      titleCard
      description={
        buyNow
          ? "Kiểm tra món đồ và thông tin giao nhận trước khi đặt hàng."
          : "Chọn món đồ và kiểm tra thông tin theo từng người bán."
      }
      footer={
        user && (uncertain || !!result.data?.total_items) ? (
          <View
            style={{
              gap: 8,
              width: "100%",
              maxWidth: 760,
              alignSelf: "center",
            }}
          >
            {!uncertain && (
              <Text style={styles.label}>
                Tổng thanh toán: {formatVnd(addVnd(subtotal, shippingTotal))}
              </Text>
            )}
            <Button
              title={
                action.pending
                  ? "Đang đặt hàng…"
                  : uncertain
                    ? "Kiểm tra lại lần đặt hàng"
                    : "Đặt các món đã chọn"
              }
              disabled={
                action.pending ||
                (!uncertain &&
                  !result.data?.groups.some((group) =>
                    group.items.some(
                      (item) =>
                        item.available && !excluded.includes(item.product_id),
                    ),
                  ))
              }
              onPress={() => {
                void action.run(async () => {
                  const existingAttempt = intent.current.current;
                  const payload =
                    existingAttempt?.payload ??
                    buildCheckoutPayload(
                      result.data!,
                      excluded,
                      deliveries,
                      user,
                    );
                  const request =
                    existingAttempt ?? intent.current.getOrCreate(payload);
                  try {
                    const data = await api.checkout.create(
                      request.payload,
                      request.key,
                    );
                    setOrders(data);
                    intent.current.clear();
                    setUncertain(false);
                    await queryClient.invalidateQueries();
                  } catch (error) {
                    if (
                      error instanceof ApiError &&
                      error.status > 0 &&
                      error.status < 500 &&
                      !["RETRY_LATER", "RATE_LIMITED"].includes(error.code)
                    ) {
                      intent.current.clear();
                      setUncertain(false);
                      await result.refetch();
                    } else setUncertain(true);
                    throw error;
                  }
                });
              }}
            />
          </View>
        ) : undefined
      }
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
          {result.data?.total_items === 0 && (
            <EmptyState
              title="Giỏ hàng đang trống"
              description="Khám phá và chọn món đồ bạn yêu thích."
              action={
                <Button
                  title="Khám phá sản phẩm"
                  onPress={() => router.push("/")}
                />
              }
            />
          )}
          {result.data?.groups.map((group) => {
            const selected = group.items.filter(
              (item) => item.available && !excluded.includes(item.product_id),
            );
            const methods = (["COD", "MEETUP"] as const).filter((method) =>
              selected.every(
                (item) =>
                  item.delivery_method === method ||
                  item.delivery_method === "BOTH",
              ),
            );
            const draft = deliveries[group.seller.id] ?? {};
            const method = draft.method ?? methods[0] ?? "COD";
            const update = (patch: Partial<CheckoutDeliveryInput>) =>
              setDeliveries((old) => ({
                ...old,
                [group.seller.id]: { ...old[group.seller.id], ...patch },
              }));
            return (
              <View key={group.seller.id} style={styles.card}>
                <Text style={styles.heading}>{group.seller.name}</Text>
                {group.items.map((item) => (
                  <View key={item.product_id} style={{ gap: 7 }}>
                    {item.image_url && (
                      <MarketplaceImage
                        uri={item.image_url}
                        accessibilityLabel={item.title}
                        style={{ width: 80, height: 80, borderRadius: 8 }}
                        contentFit="cover"
                      />
                    )}
                    <Text style={styles.text}>
                      {item.title} · {formatVnd(item.price)}
                    </Text>
                    <Text style={styles.muted}>{item.unavailable_reason}</Text>
                    {(!buyNow || !product_id) && (
                      <View style={styles.row}>
                        <Button
                          title={
                            item.available &&
                            !excluded.includes(item.product_id)
                              ? "Đã chọn"
                              : "Chọn"
                          }
                          secondary
                          disabled={
                            uncertain ||
                            action.pending ||
                            !item.available ||
                            (buyNow && !!product_id)
                          }
                          onPress={() =>
                            setExcluded((ids) =>
                              ids.includes(item.product_id)
                                ? ids.filter((id) => id !== item.product_id)
                                : [...ids, item.product_id],
                            )
                          }
                        />
                        <Button
                          title="Bỏ khỏi giỏ"
                          secondary
                          disabled={
                            uncertain ||
                            action.pending ||
                            (buyNow && !!product_id)
                          }
                          onPress={() => {
                            void action.run(async () => {
                              await api.cart.remove(item.product_id);
                              await result.refetch();
                            });
                          }}
                        />
                      </View>
                    )}
                  </View>
                ))}
                {selected.length > 0 && (
                  <>
                    <Text style={styles.heading}>Giao nhận</Text>
                    <View style={styles.row}>
                      {methods.map((choice) => (
                        <Button
                          key={choice}
                          title={choice === "COD" ? "COD" : "Gặp trực tiếp"}
                          secondary={method !== choice}
                          disabled={uncertain || action.pending}
                          onPress={() => update({ method: choice })}
                        />
                      ))}
                    </View>
                    {methods.length === 0 && (
                      <Text style={styles.error}>
                        Các món này không cùng hỗ trợ một hình thức giao nhận.
                        Hãy chọn lại món đồ.
                      </Text>
                    )}
                    <Field
                      label="Người nhận"
                      editable={!uncertain && !action.pending}
                      value={draft.recipient_name ?? user.full_name}
                      onChangeText={(recipient_name) =>
                        update({ recipient_name })
                      }
                    />
                    <Field
                      label="Số điện thoại"
                      editable={!uncertain && !action.pending}
                      keyboardType="phone-pad"
                      value={draft.recipient_phone ?? user.phone ?? ""}
                      onChangeText={(recipient_phone) =>
                        update({ recipient_phone })
                      }
                    />
                    <Field
                      label="Địa chỉ giao hàng / địa điểm gặp"
                      editable={!uncertain && !action.pending}
                      value={
                        draft.delivery_address ?? user.default_address ?? ""
                      }
                      onChangeText={(delivery_address) =>
                        update({ delivery_address })
                      }
                    />
                    <Text style={styles.muted}>
                      Phí:{" "}
                      {formatVnd(
                        orderShippingFee(
                          method,
                          selected.map((item) => item.shipping_fee),
                        ),
                      )}
                    </Text>
                  </>
                )}
              </View>
            );
          })}
          {!uncertain && (
            <View style={styles.card}>
              <Text style={styles.text}>Tiền hàng: {formatVnd(subtotal)}</Text>
              <Text style={styles.text}>
                Phí giao nhận: {formatVnd(shippingTotal)}
              </Text>
              <Text style={styles.heading}>
                Tổng thanh toán: {formatVnd(addVnd(subtotal, shippingTotal))}
              </Text>
            </View>
          )}
          {uncertain && (
            <Text style={styles.text}>
              Chưa nhận được kết quả đặt hàng. Thử lại yêu cầu cũ để kiểm tra
              kết quả, tránh tạo thêm đơn.
            </Text>
          )}
          <Feedback error={action.error} />
        </>
      )}
    </Screen>
  );
}
