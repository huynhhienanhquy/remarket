import type { OrderDetail } from "@remarket/shared";
import { DELIVERY_LABELS, conditionLabel, formatVnd } from "@remarket/shared";
import { MarketplaceImage } from "../../../components/common";
export function OrderContents({ order }: { order: OrderDetail }) {
  const deliveryLabel = DELIVERY_LABELS[order.delivery_method];
  return <><section className="rounded-card border border-line bg-surface p-5" aria-labelledby="items-heading">
    <h2 id="items-heading" className="t-h3 text-ink mb-4">Món đồ</h2>
    <div className="divide-y divide-line">
      {order.items.map((snap) => (
        <div key={snap.id} className="py-4 flex gap-4">
          {snap.image_url ? (
            <MarketplaceImage
              variant="card"
              src={snap.image_url}
              alt=""
              className="h-16 w-16 shrink-0 rounded-control object-cover"
            />
          ) : (
            <div className="h-16 w-16 shrink-0 rounded-control bg-surface-subtle" />
          )}
          <div className="min-w-0 flex-1">
            <p className="t-body text-ink">{snap.title_snapshot}</p>
            <p className="t-meta text-muted">
              {conditionLabel(snap.condition_snapshot)}
            </p>
            <p className="t-price-card text-ink">{formatVnd(snap.price)}</p>
          </div>
        </div>
      ))}
    </div>
  </section>

    <section className="rounded-card border border-line bg-surface p-5" aria-labelledby="delivery-heading">
      <h2 id="delivery-heading" className="t-h3 text-ink mb-4">Giao nhận</h2>
      <dl className="space-y-2">
        <div className="flex justify-between">
          <dt className="t-body text-muted">Phương thức</dt>
          <dd className="t-body text-ink">{deliveryLabel}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="t-body text-muted">Người nhận</dt>
          <dd className="t-body text-ink">{order.delivery.recipient_name ?? "—"}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="t-body text-muted">Số điện thoại</dt>
          <dd className="t-body text-ink">{order.delivery.recipient_phone ?? "—"}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="t-body text-muted">Địa chỉ</dt>
          <dd className="t-body text-ink">{order.delivery.delivery_address ?? "—"}</dd>
        </div>
        {order.delivery.carrier && (
          <div className="flex justify-between">
            <dt className="t-body text-muted">Đơn vị vận chuyển</dt>
            <dd className="t-body text-ink">{order.delivery.carrier}</dd>
          </div>
        )}
        {order.delivery.tracking_code && (
          <div className="flex justify-between">
            <dt className="t-body text-muted">Mã vận đơn</dt>
            <dd className="t-body text-ink">{order.delivery.tracking_code}</dd>
          </div>
        )}
      </dl>
    </section></>;
}
