import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addVnd, formatVnd, validatePrice, validatePhone } from "@remarket/shared";
import { api } from "../../lib/api";
import { queryKeys } from "../../lib/queryClient";
import { useSession } from "../../app/SessionProvider";
import { isApiError } from "../../lib/errors";
import {
  Button,
  EmptyState,
  FormField,
  InlineAlert,
  Input,
  Radio,
} from "../../components/ui";

function generateIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
}

interface CheckoutDeliveryInput {
  seller_id: string;
  method: "COD" | "MEETUP";
  recipient_name: string;
  recipient_phone: string;
  delivery_address: string;
  province_code: string;
  expected_shipping_fee: string;
}

type CheckoutDeliveryPatch = Partial<Omit<CheckoutDeliveryInput, "seller_id">>;

export function CheckoutPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const { viewer } = useSession();

  const [idempotencyKey, setIdempotencyKey] = useState(generateIdempotencyKey());
  const [draft, setDraft] = useState<Record<string, CheckoutDeliveryInput>>({});
  const [priceChangedAlert, setPriceChangedAlert] = useState<{
    items: Array<{ product_id: string; current_price: string; cart_price: string }>;
  } | null>(null);

  const itemsParam = searchParams.get("items");
  const selectedIds = useMemo(
    () => (itemsParam ? itemsParam.split(",").filter(Boolean) : []),
    [itemsParam],
  );

  const cart = useQuery({
    queryKey: queryKeys.cart,
    queryFn: () => api.cart.get(),
  });

  const provinces = useQuery({
    queryKey: queryKeys.provinces,
    queryFn: () => api.categories.provinces(),
    staleTime: 5 * 60_000,
  });

  const groups = useMemo(() => cart.data?.groups ?? [], [cart.data?.groups]);
  const availableItems = useMemo(() => {
    const items: Array<{
      product_id: string;
      expected_price: string;
      seller_id: string;
    }> = [];
    for (const group of groups) {
      for (const item of group.items) {
        if (
          (selectedIds.length === 0 || selectedIds.includes(item.product_id)) &&
          item.available &&
          !item.unavailable_reason
        ) {
          items.push({
            product_id: item.product_id,
            expected_price: item.price,
            seller_id: group.seller.id,
          });
        }
      }
    }
    return items;
  }, [groups, selectedIds]);

  const sellerIds = useMemo(
    () => Array.from(new Set(availableItems.map((i) => i.seller_id))),
    [availableItems],
  );

  useEffect(() => {
    setDraft((previous) => {
      let next = previous;
      for (const sellerId of sellerIds) {
        if (previous[sellerId]) continue;
        if (next === previous) next = { ...previous };
        next[sellerId] = {
          seller_id: sellerId,
          method: "COD",
          recipient_name: viewer?.full_name ?? "",
          recipient_phone: viewer?.phone ?? "",
          delivery_address: viewer?.default_address ?? "",
          province_code: viewer?.province_code ?? "",
          expected_shipping_fee: "0",
        };
      }
      return next;
    });
  }, [sellerIds, viewer]);

  function updateDelivery(sellerId: string, patch: CheckoutDeliveryPatch) {
    setDraft((prev) => ({
      ...prev,
      [sellerId]: { ...prev[sellerId], ...patch } as CheckoutDeliveryInput,
    }));
  }

  const subtotal = useMemo(() => addVnd(...availableItems.map((i) => i.expected_price)), [availableItems]);

  const checkout = useMutation({
    mutationFn: (payload: { items: Array<{ product_id: string; expected_price: string }>; deliveries: CheckoutDeliveryInput[]; idempotency_key: string }) =>
      api.checkout.create(payload, payload.idempotency_key),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.cart });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      navigate(`/orders/${result.orders[0]?.id ?? ""}`);
    },
    onError: (caught) => {
      if (isApiError(caught)) {
        if (caught.code === "PRICE_CHANGED") {
          const details = caught.details as { items?: Array<{ product_id: string; current_price: string; cart_price: string }> };
          setPriceChangedAlert({ items: details?.items ?? [] });
        }
      }
    },
  });

  async function handleSubmit() {
    if (checkout.isPending) return;

    const deliveries: CheckoutDeliveryInput[] = [];
    for (const sellerId of sellerIds) {
      const d = draft[sellerId];
      if (!d) continue;

      const deliveryErrors: Record<string, string> = {};
      if (!d.recipient_name.trim()) deliveryErrors.recipient_name = "Tên người nhận không được để trống.";
      const phoneErr = validatePhone(d.recipient_phone);
      if (phoneErr) deliveryErrors.recipient_phone = phoneErr;
      if (!d.delivery_address.trim()) deliveryErrors.delivery_address = "Địa chỉ không được để trống.";
      if (!d.province_code) deliveryErrors.province_code = "Vui lòng chọn khu vực.";

      if (d.method === "COD") {
        const feeErr = validatePrice(d.expected_shipping_fee);
        if (feeErr) deliveryErrors.expected_shipping_fee = "Phí giao hàng không hợp lệ.";
      }

      if (Object.keys(deliveryErrors).length > 0) {
        console.error("Validation errors for seller", sellerId, deliveryErrors);
        return;
      }

      deliveries.push(d);
    }

    if (deliveries.length === 0) return;

    setIdempotencyKey(generateIdempotencyKey());

    await checkout.mutateAsync({
      items: availableItems,
      deliveries,
      idempotency_key: idempotencyKey,
    });
  }

  function handlePriceChangedRefresh() {
    setPriceChangedAlert(null);
    queryClient.invalidateQueries({ queryKey: queryKeys.cart });
  }

  if (cart.isPending || provinces.isPending) {
    return (
      <div className="rm-container py-6 lg:py-8">
        <h1 className="t-h1 text-ink mb-6">Đặt hàng</h1>
        <div className="space-y-4">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="rounded-card border border-line bg-surface p-4 space-y-3">
              <div className="h-8 w-1/4 bg-surface-subtle rounded-control" />
              <div className="h-4 w-1/2 bg-surface-subtle rounded-control" />
              <div className="h-4 w-1/3 bg-surface-subtle rounded-control" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (cart.isError) {
    return (
      <div className="rm-container py-6 lg:py-8">
        <h1 className="t-h1 text-ink mb-6">Đặt hàng</h1>
        <InlineAlert
          tone="danger"
          title="Không tải được giỏ hàng"
          action={
            <Button variant="secondary" onClick={() => cart.refetch()}>
              Tải lại
            </Button>
          }
        />
      </div>
    );
  }

  if (availableItems.length === 0) {
    return (
      <div className="rm-container py-6 lg:py-8">
        <h1 className="t-h1 text-ink mb-6">Đặt hàng</h1>
        <EmptyState
          title="Không có món đồ khả dụng"
          description="Giỏ hàng trống hoặc các món đã chọn không còn khả dụng."
          action={{ label: "Quay lại giỏ hàng", to: "/cart" }}
        />
      </div>
    );
  }

  return (
    <div className="rm-container py-6 lg:py-8">
      {priceChangedAlert && (
        <InlineAlert
          tone="warning"
          title="Giá đã thay đổi"
          action={
            <Button variant="secondary" onClick={handlePriceChangedRefresh}>
              Cập nhật giá mới
            </Button>
          }
        >
          Một số món đồ đã thay đổi giá. Vui lòng cập nhật để tiếp tục đặt hàng.
        </InlineAlert>
      )}

      <div className="space-y-6">
        <h1 className="t-h1 text-ink">Đặt hàng</h1>

        <div className="rounded-card border border-line bg-surface p-5 space-y-4">
          <h2 className="t-h3 text-ink">Thông tin người nhận & giao nhận</h2>

          {sellerIds.map((sellerId) => {
            const sellerGroup = groups.find((g) => g.seller.id === sellerId);
            const delivery = draft[sellerId];
            if (!delivery || !sellerGroup) return null;

            return (
              <section key={sellerId} className="space-y-4 border-t border-line pt-4 first:border-t-0 first:pt-0">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="t-label text-ink">{sellerGroup.seller.name}</p>
                    <p className="t-meta text-muted">{sellerGroup.items.length} món đồ</p>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField label="Phương thức giao nhận" htmlFor="delivery-method" required>
                    <div className="flex gap-4">
                      <Radio
                        name={`delivery-${sellerId}`}
                        checked={delivery.method === "COD"}
                        onChange={() => updateDelivery(sellerId, { method: "COD" })}
                        label="Giao hàng (COD)"
                      />
                      <Radio
                        name={`delivery-${sellerId}`}
                        checked={delivery.method === "MEETUP"}
                        onChange={() => updateDelivery(sellerId, { method: "MEETUP" })}
                        label="Gặp trực tiếp"
                      />
                    </div>
                  </FormField>

                  <FormField label="Khu vực" htmlFor={`province-${sellerId}`} required error={!delivery.province_code ? "Vui lòng chọn khu vực" : undefined}>
                    <select
                      id={`province-${sellerId}`}
                      value={delivery.province_code}
                      onChange={(e) => updateDelivery(sellerId, { province_code: e.target.value })}
                      className="h-11 w-full rounded-control border border-input-line bg-surface px-3 t-body text-ink focus:border-focus focus:outline-none focus:ring-2 focus:ring-focus/30"
                    >
                      <option value="">Chọn khu vực</option>
                      {provinces.data?.map((p) => (
                        <option key={p.code} value={p.code}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </FormField>

                  <FormField label="Tên người nhận" htmlFor={`recipient-${sellerId}`} required error={!delivery.recipient_name.trim() ? "Tên không được để trống" : undefined}>
                    <Input
                      id={`recipient-${sellerId}`}
                      value={delivery.recipient_name}
                      onChange={(e) => updateDelivery(sellerId, { recipient_name: e.target.value })}
                      placeholder="Nguyễn Văn A"
                    />
                  </FormField>

                  <FormField label="Số điện thoại" htmlFor={`phone-${sellerId}`} required error={validatePhone(delivery.recipient_phone) ?? undefined}>
                    <Input
                      id={`phone-${sellerId}`}
                      inputMode="tel"
                      value={delivery.recipient_phone}
                      onChange={(e) => updateDelivery(sellerId, { recipient_phone: e.target.value })}
                      placeholder="0912345678"
                    />
                  </FormField>
                </div>

                <FormField label="Địa chỉ giao nhận" htmlFor={`address-${sellerId}`} required error={!delivery.delivery_address.trim() ? "Địa chỉ không được để trống" : undefined}>
                  <Input
                    id={`address-${sellerId}`}
                    value={delivery.delivery_address}
                    onChange={(e) => updateDelivery(sellerId, { delivery_address: e.target.value })}
                    placeholder="Số nhà, đường, phường, quận/huyện"
                  />
                </FormField>

                {delivery.method === "COD" && (
                  <FormField label="Phí giao hàng" htmlFor={`shipping-${sellerId}`} required error={validatePrice(delivery.expected_shipping_fee) ?? undefined}>
                    <Input
                      id={`shipping-${sellerId}`}
                      inputMode="numeric"
                      value={delivery.expected_shipping_fee}
                      onChange={(e) => updateDelivery(sellerId, { expected_shipping_fee: e.target.value.replace(/\D/g, "") })}
                      placeholder="0"
                    />
                  </FormField>
                )}
              </section>
            );
          })}
        </div>

        <div className="rounded-card border border-line bg-surface p-5 space-y-3">
          <h2 className="t-h3 text-ink">Xác nhận đơn hàng</h2>
          <div className="divide-y divide-line">
            {availableItems.map((item) => {
              const product = groups.flatMap((g) => g.items).find((i) => i.product_id === item.product_id);
              if (!product) return null;
              return (
                <div key={item.product_id} className="flex justify-between py-3">
                  <div>
                    <p className="t-body text-ink">{product.title}</p>
                    <p className="t-meta text-muted">{formatVnd(product.price)}</p>
                  </div>
                  <span className="t-body text-ink">{formatVnd(item.expected_price)}</span>
                </div>
              );
            })}
            <div className="flex justify-between py-3 font-semibold">
              <span className="t-body text-ink">Tạm tính</span>
              <span className="t-body text-ink">{formatVnd(subtotal)}</span>
            </div>
            <div className="flex justify-between py-3">
              <span className="t-meta text-muted">Phí giao hàng</span>
              <span className="t-meta text-muted">Tính theo từng người bán</span>
            </div>
          </div>
        </div>

        <Button size="lg" fullWidth variant="primary" loading={checkout.isPending} onClick={handleSubmit}>
          {checkout.isPending ? "Đang xử lý..." : "Đặt hàng"}
        </Button>
      </div>

      <p className="mt-6 t-meta text-muted text-center">
        <Link to="/cart" className="t-label text-brand hover:underline">
          ← Quay lại giỏ hàng
        </Link>
      </p>
    </div>
  );
}
