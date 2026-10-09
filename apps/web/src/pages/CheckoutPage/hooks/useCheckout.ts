import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addVnd, validateShippingFee, validatePhone } from "@remarket/shared";
import { api } from "@/services/api";
import { queryKeys } from "@/config/queryClient";
import { useSession } from "@/contexts/SessionContext";
import { isApiError } from "@/helpers/errors";
import type { CheckoutPayload } from "@remarket/shared";
import { useConnectivity } from "@/hooks/useConnectivity";

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

/**
 * Keeps the checkout draft and payload-signature idempotency key across retry attempts.
 * Called once by the route component; hook order and handlers match the original page.
 */
export function useCheckout() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const { viewer } = useSession();

  const attempt = useRef<{ payload: string; key: string } | null>(null);
  const online = useConnectivity();
  const [submissionError, setSubmissionError] = useState<string | null>(null);
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
  const productDetails = useQuery({
    queryKey: ["checkout", "products", availableItems.map((item) => item.product_id)],
    queryFn: () => Promise.all(availableItems.map((item) => api.products.detail(item.product_id))),
    enabled: availableItems.length > 0,
  });
  function shippingFor(sellerId: string, method: "COD" | "MEETUP"): string {
    if (method === "MEETUP") return "0";
    return (productDetails.data ?? []).filter((item) => item.seller.id === sellerId).reduce((max, item) => BigInt(item.shipping_fee) > BigInt(max) ? item.shipping_fee : max, "0");
  }
  function methodsFor(sellerId: string): Array<"COD" | "MEETUP"> {
    const products = (productDetails.data ?? []).filter((item) => item.seller.id === sellerId);
    return products.length === 0 ? [] : (["COD", "MEETUP"] as const).filter((method) => products.every((item) => item.delivery_method === "BOTH" || item.delivery_method === method));
  }

  useEffect(() => {
    if (!productDetails.data) return;
    setDraft((previous) => {
      let next = previous;
      for (const sellerId of sellerIds) {
        if (previous[sellerId]) continue;
        if (next === previous) next = { ...previous };
        next[sellerId] = {
          seller_id: sellerId,
          method: productDetails.data.filter((item) => item.seller.id === sellerId).every((item) => item.delivery_method !== "MEETUP") ? "COD" : "MEETUP",
          recipient_name: viewer?.full_name ?? "",
          recipient_phone: viewer?.phone ?? "",
          delivery_address: viewer?.default_address ?? "",
          province_code: viewer?.province_code ?? "",
          expected_shipping_fee: productDetails.data.filter((item) => item.seller.id === sellerId).reduce((max, item) => BigInt(item.shipping_fee) > BigInt(max) ? item.shipping_fee : max, "0"),
        };
      }
      return next;
    });
  }, [sellerIds, viewer, productDetails.data]);

  function updateDelivery(sellerId: string, patch: CheckoutDeliveryPatch) {
    setDraft((prev) => ({
      ...prev,
      [sellerId]: { ...prev[sellerId], ...patch, ...(patch.method ? { expected_shipping_fee: shippingFor(sellerId, patch.method) } : {}) } as CheckoutDeliveryInput,
    }));
  }

  const subtotal = useMemo(() => addVnd(...availableItems.map((i) => i.expected_price)), [availableItems]);

  const checkout = useMutation({
    mutationFn: ({ payload, key }: { payload: CheckoutPayload; key: string }) => api.checkout.create(payload, key),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.cart });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
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
    if (checkout.isPending || !online || !productDetails.data) return;
    setSubmissionError(null);

    const deliveries: CheckoutDeliveryInput[] = [];
    for (const sellerId of sellerIds) {
      const d = draft[sellerId];
      if (!d) continue;

      const deliveryErrors: Record<string, string> = {};
      if (!d.recipient_name.trim()) deliveryErrors.recipient_name = "Tên người nhận không được để trống.";
      const phoneErr = validatePhone(d.recipient_phone);
      if (phoneErr) deliveryErrors.recipient_phone = phoneErr;
      if (!d.delivery_address.trim()) deliveryErrors.delivery_address = "Địa chỉ không được để trống.";
      if (!methodsFor(sellerId).includes(d.method)) deliveryErrors.method = "Các món của người bán không có hình thức giao nhận chung. Hãy đặt riêng từng món.";

      if (d.method === "COD") {
        const feeErr = validateShippingFee(shippingFor(sellerId, d.method), true);
        if (feeErr) deliveryErrors.expected_shipping_fee = "Phí giao hàng không hợp lệ.";
      }

      if (Object.keys(deliveryErrors).length > 0) {
        setSubmissionError(Object.values(deliveryErrors).join(" "));
        return;
      }

      deliveries.push({ ...d, expected_shipping_fee: shippingFor(sellerId, d.method) });
    }

    if (deliveries.length === 0) return;

    const payload: CheckoutPayload = {
      items: availableItems.map(({ product_id, expected_price }) => ({ product_id, expected_price })),
      deliveries: deliveries.map(({ province_code: _province, ...delivery }) => delivery),
    };
    const signature = JSON.stringify(payload);
    if (!attempt.current || attempt.current.payload !== signature) attempt.current = { payload: signature, key: generateIdempotencyKey() };
    try { await checkout.mutateAsync({ payload, key: attempt.current.key }); }
    catch { /* The mutation's error panel owns feedback; never leak a rejected event promise. */ }
  }

  function handlePriceChangedRefresh() {
    setPriceChangedAlert(null);
    queryClient.invalidateQueries({ queryKey: queryKeys.cart });
    queryClient.invalidateQueries({ queryKey: ["checkout", "products"] });
  }
  return {
    online,
    submissionError,
    draft,
    priceChangedAlert,
    cart,
    provinces,
    groups,
    availableItems,
    sellerIds,
    productDetails,
    shippingFor,
    methodsFor,
    updateDelivery,
    subtotal,
    checkout,
    handleSubmit,
    handlePriceChangedRefresh,
  };
}
