import { useCheckout } from "./hooks/useCheckout";
import { Link } from "react-router-dom";
import { formatVnd, validatePhone } from "@remarket/shared";
import { OfflineNotice, QueryFailure } from "../../components/common/PageFeedback/PageFeedback";
import {
  Button,
  EmptyState,
  FormField,
  InlineAlert,
  Input,
  Radio,
} from "../../components/common";

export function CheckoutPage() {
  const {
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
  } = useCheckout();

  if (cart.isPending || provinces.isPending || (availableItems.length > 0 && productDetails.isPending)) {
    return (
      <div className="rm-container py-6 lg:py-8">
        <h1 className="t-h1 text-ink mb-6">Đặt hàng</h1>
        <div className="space-y-4" aria-busy="true">
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
      <OfflineNotice online={online} />
      {submissionError && <InlineAlert tone="danger" title="Kiểm tra thông tin giao nhận">{submissionError}</InlineAlert>}
      {checkout.isError && <QueryFailure error={checkout.error} />}
      {provinces.isError && <QueryFailure error={provinces.error} retry={() => void provinces.refetch()} />}
      {productDetails.isError && <QueryFailure error={productDetails.error} retry={() => void productDetails.refetch()} />}
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
                {methodsFor(sellerId).length === 0 && <InlineAlert tone="warning" title={productDetails.isPending ? "Đang tải hình thức giao nhận…" : "Các món này không có phương thức giao nhận chung"}>Hãy đặt riêng từng món nếu các phương thức không tương thích.</InlineAlert>}
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
                        disabled={!methodsFor(sellerId).includes("COD") || checkout.isPending}
                        checked={delivery.method === "COD"}
                        onChange={() => updateDelivery(sellerId, { method: "COD" })}
                        label="Giao hàng (COD)"
                      />
                      <Radio
                        name={`delivery-${sellerId}`}
                        disabled={!methodsFor(sellerId).includes("MEETUP") || checkout.isPending}
                        checked={delivery.method === "MEETUP"}
                        onChange={() => updateDelivery(sellerId, { method: "MEETUP" })}
                        label="Gặp trực tiếp"
                      />
                    </div>
                  </FormField>

                  <FormField label="Khu vực" htmlFor={`province-${sellerId}`}>
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
                  <FormField label="Phí giao hàng" htmlFor={`shipping-${sellerId}`} helper="Phí cao nhất trong nhóm món của người bán, do hệ thống tính.">
                    <Input
                      id={`shipping-${sellerId}`}
                      inputMode="numeric"
                      value={shippingFor(sellerId, delivery.method)}
                      readOnly
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

        <Button size="lg" fullWidth variant="primary" loading={checkout.isPending} disabled={!online || !productDetails.data || sellerIds.some((sellerId) => methodsFor(sellerId).length === 0)} onClick={handleSubmit}>
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
