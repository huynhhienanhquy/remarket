import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ORDER_STATUS_LABELS,
  DELIVERY_LABELS,
  formatDateTime,
  formatVnd,
  primaryOrderAction,
  ORDER_ACTION_LABELS,
} from "@remarket/shared";
import { api } from "../../lib/api";
import { queryKeys } from "../../lib/queryClient";
import { useSession } from "../../app/SessionProvider";
import { isApiError } from "../../lib/errors";
import { OfflineNotice, useConnectivity } from "../../components/features/PageFeedback";
import {
  Button,
  ConfirmDialog,
  Dialog,
  EmptyState,
  InlineAlert,
  OrderTimeline,
  MarketplaceImage,
  StatusBadge,
  UserSummary,
} from "../../components/ui";

type Role = "buyer" | "seller";

interface OrderDetailPageProps {
  role: Role;
}

export function OrderDetailPage({ role }: OrderDetailPageProps) {
  const { id = "" } = useParams();
  const queryClient = useQueryClient();
  const { viewer: _viewer } = useSession();
  const online = useConnectivity();

  const [confirmOpen, setConfirmOpen] = useState<{ action: string; reason: string } | null>(null);
  const [shipFields, setShipFields] = useState<{ carrier: string; tracking: string } | null>(null);
  const [deliverChecks, setDeliverChecks] = useState<{ received: boolean; paid: boolean } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  const detail = useQuery({
    queryKey: queryKeys.order(id),
    queryFn: () => api.orders.detail(id),
    enabled: id !== "",
  });

  const order = detail.data;

  const isBuyer = (order?.role ?? role) === "buyer";
  const counterparty = order?.counterparty ?? null;
  const myAllowedActions = order?.allowed_actions ?? [];

  const canConfirm = myAllowedActions.includes("confirm");
  const canCancel = myAllowedActions.includes("cancel");
  const canShip = myAllowedActions.includes("ship");
  const canDeliver = myAllowedActions.includes("deliver");
  const canComplete = myAllowedActions.includes("complete");

  const timelineSteps = useMemo(() => {
    if (!order) return [];
    const statusOrder: Array<"PENDING" | "CONFIRMED" | "SHIPPING" | "DELIVERED" | "COMPLETED" | "CANCELLED"> =
      ["PENDING", "CONFIRMED", "SHIPPING", "DELIVERED", "COMPLETED", "CANCELLED"];
    const steps = statusOrder.map((status) => {
      const entry = order.status_history.find((e) => e.to_status === status);
      const done = entry !== undefined;
      return {
        label: ORDER_STATUS_LABELS[status as keyof typeof ORDER_STATUS_LABELS]?.label ?? status,
        status,
        done,
        at: entry?.created_at ?? undefined,
        actor: entry?.actor_name ?? undefined,
        tone: done ? "brand" as const : "neutral" as const,
      };
    });
    return steps;
  }, [order]);

  async function handleAction(
    action: "confirm" | "cancel" | "ship" | "deliver" | "complete",
    body: Record<string, unknown>,
  ) {
    if (!order || pendingAction || !online) return;
    setActionError(null);
    setPendingAction(action);
    try {
      await api.orders.act(id, action, {
        expected_version: order!.version,
        ...body,
      } as Parameters<typeof api.orders.act>[2]);
      for (const key of ["orders", "products", "profiles", "cart", "notifications"]) void queryClient.invalidateQueries({ queryKey: [key] });
    } catch (caught) {
      if (isApiError(caught)) {
        if (caught.code === "VERSION_CONFLICT") {
          queryClient.invalidateQueries({ queryKey: queryKeys.order(id) });
          setActionError("Đơn hàng đã thay đổi, dữ liệu đã được tải lại.");
        } else if (caught.code === "INVALID_ORDER_TRANSITION") {
          setActionError("Hành động không hợp lệ cho trạng thái hiện tại.");
        } else if (caught.code === "ORDER_EXPIRED") {
          setActionError("Đơn hàng đã hết hạn xử lý.");
        } else {
          setActionError(caught.message || "Không thực hiện được hành động.");
        }
      } else {
        setActionError("Lỗi không mong muốn.");
      }
    } finally {
      setPendingAction(null);
    }
  }

  function openConfirm(action: "cancel" | "complete") {
    setConfirmOpen({ action, reason: "" });
  }

  function openShip() {
    setShipFields({ carrier: "", tracking: "" });
  }

  function openDeliver() {
    setDeliverChecks({ received: false, paid: false });
  }

  function closeModals() {
    setConfirmOpen(null);
    setShipFields(null);
    setDeliverChecks(null);
    setActionError(null);
  }

  if (detail.isPending) {
    return (
      <div className="rm-container py-6 lg:py-8">
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="h-8 w-1/4 bg-surface-subtle rounded-control" />
            <div className="flex-1">
              <div className="h-6 w-1/3 bg-surface-subtle rounded-control" />
            </div>
          </div>
          <OrderTimelineSkeleton />
        </div>
      </div>
    );
  }

  if (detail.isError || !order) {
    const notFound = isApiError(detail.error) && detail.error.status === 404;
    return (
      <div className="rm-container py-12">
        <EmptyState
          title={notFound ? "Không tìm thấy đơn hàng này" : "Không tải được đơn hàng"}
          description={notFound ? "Đơn hàng có thể đã bị xóa hoặc bạn không có quyền xem." : "Vui lòng thử lại sau."}
          action={{ label: isBuyer ? "Đơn mua" : "Đơn bán", to: isBuyer ? "/orders" : "/sales" }}
        />
      </div>
    );
  }

  const statusMeta = ORDER_STATUS_LABELS[order.status as keyof typeof ORDER_STATUS_LABELS];
  const deliveryLabel = DELIVERY_LABELS[order.delivery_method];
  const nextAction = primaryOrderAction({
    status: order.status,
    role: isBuyer ? "buyer" : "seller",
    delivery: order.delivery_method,
  });

  return (
    <div className="rm-container py-6 lg:py-8">
      <nav aria-label="Đường dẫn" className="t-meta text-muted mb-4">
        <Link to="/" className="hover:text-ink">Trang chủ</Link>
        <span aria-hidden="true"> / </span>
        <Link to={isBuyer ? "/orders" : "/sales"} className="hover:text-ink">
          {isBuyer ? "Đơn mua" : "Đơn bán"}
        </Link>
        <span aria-hidden="true"> / </span>
        <span className="text-ink">#{order.code.slice(0, 8).toUpperCase()}</span>
      </nav>

      <OfflineNotice online={online} />
      {actionError && <InlineAlert tone="danger" title={actionError} />}

      <section className="rounded-card border border-line bg-surface p-5 mb-6">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <p className="t-h2 text-ink">Đơn hàng #{order.code.slice(0, 8).toUpperCase()}</p>
            <StatusBadge label={statusMeta?.label ?? order.status} tone={statusMeta?.tone ?? "neutral"} />
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(order.id)}
              className="t-label text-brand hover:underline"
            >
              Sao chép mã đơn
            </button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <time dateTime={order.created_at} className="t-meta text-muted">
            Tạo lúc: {formatDateTime(order.created_at)}
          </time>
          <span className="t-meta text-muted">{deliveryLabel}</span>
          <span className="t-meta text-muted">{formatVnd(order.total_amount)}</span>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <section className="rounded-card border border-line bg-surface p-5" aria-labelledby="timeline-heading">
            <h2 id="timeline-heading" className="t-h3 text-ink mb-4">
              Tiến trình đơn hàng
            </h2>
            <OrderTimeline
              steps={timelineSteps}
              currentStatus={order.status}
            />
            {nextAction && (
              <div className="mt-4 p-3 rounded-control bg-brand-soft">
                <p className="t-meta text-brand">
                  Bước tiếp theo: <strong>{ORDER_ACTION_LABELS[nextAction]}</strong>
                </p>
              </div>
            )}
          </section>

          <section className="rounded-card border border-line bg-surface p-5" aria-labelledby="items-heading">
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
                      {snap.condition_snapshot === "LIKE_NEW"
                        ? "Rất tốt"
                        : snap.condition_snapshot === "GOOD"
                        ? "Tốt"
                        : snap.condition_snapshot === "FAIR"
                        ? "Bình thường"
                        : "Mới"}
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
          </section>
        </div>

        <div className="space-y-6">
          <section className="rounded-card border border-line bg-surface p-5" aria-labelledby="counterparty-heading">
            <h2 id="counterparty-heading" className="t-h3 text-ink mb-4">
              {isBuyer ? "Người bán" : "Người mua"}
            </h2>
            {counterparty ? (
              <UserSummary user={counterparty} size="lg" />
            ) : (
              <p className="t-meta text-muted">Không có thông tin</p>
            )}
          </section>

          <section className="rounded-card border border-line bg-surface p-5" aria-labelledby="actions-heading">
            <h2 id="actions-heading" className="t-h3 text-ink mb-4">Hành động</h2>
            <div className="space-y-3">
              {canConfirm && (
                <Button
                  variant="primary"
                  fullWidth
                  loading={pendingAction === "confirm"}
                  onClick={() => handleAction("confirm", {})}
                >
                  Xác nhận đơn hàng
                </Button>
              )}

              {canCancel && (
                <Button
                  variant="danger"
                  fullWidth
                  loading={pendingAction === "cancel"}
                  onClick={() => openConfirm("cancel")}
                >
                  Hủy đơn hàng
                </Button>
              )}

              {canShip && (
                <Button
                  variant="secondary"
                  fullWidth
                  loading={pendingAction === "ship"}
                  onClick={openShip}
                >
                  Giao hàng
                </Button>
              )}

              {canDeliver && (
                <Button
                  variant="primary"
                  fullWidth
                  loading={pendingAction === "deliver"}
                  onClick={openDeliver}
                >
                  Xác nhận giao hàng
                </Button>
              )}

              {canComplete && (
                <Button
                  variant="primary"
                  fullWidth
                  loading={pendingAction === "complete"}
                  onClick={() => openConfirm("complete")}
                >
                  Hoàn tất đơn hàng
                </Button>
              )}

              {order.status === "COMPLETED" && isBuyer && order.review.can_review && !order.review.existing && (
                <Button
                  variant="secondary"
                  fullWidth
                  onClick={() => {
                    console.log("Open review for", order.id);
                  }}
                >
                  Đánh giá người bán
                </Button>
              )}

              <Link
                to={`/support/new?order_id=${order.id}`}
                className="block"
              >
                <Button variant="ghost" fullWidth>
                  Yêu cầu hỗ trợ
                </Button>
              </Link>
            </div>
          </section>
        </div>
      </div>

      {confirmOpen && (
        <ConfirmDialog
          open
          onCancel={closeModals}
          title={confirmOpen.action === "cancel" ? "Hủy đơn hàng" : "Hoàn tất đơn hàng"}
          description={
            confirmOpen.action === "cancel"
              ? "Bạn có chắc chắn muốn hủy đơn hàng này? Hành động này không thể hoàn tác."
              : "Xác nhận bạn đã nhận đủ hàng và đã thanh toán? Hành động này không thể hoàn tác."
          }
          confirmLabel={confirmOpen.action === "cancel" ? "Hủy đơn" : "Hoàn tất"}
          cancelLabel="Đóng"
          tone={confirmOpen.action === "cancel" ? "danger" : "primary"}
          loading={pendingAction === confirmOpen.action}
          onConfirm={() => {
            if (confirmOpen.action === "cancel") {
              handleAction("cancel", { reason: confirmOpen.reason });
            } else {
              handleAction("complete", {
                buyer_confirmed_received: true,
                buyer_confirmed_paid: true,
              });
            }
            closeModals();
          }}
          reasonField={
            confirmOpen.action === "cancel"
              ? {
                  label: "Lý do hủy",
                  required: true,
                  value: confirmOpen.reason,
                  onChange: (v) => setConfirmOpen({ ...confirmOpen, reason: v }),
                  placeholder: "Lý do hủy...",
                }
              : undefined
          }
        />
      )}

      {shipFields && (
        <Dialog
          open
          onClose={closeModals}
          title="Giao hàng"
          dismissible={!pendingAction}
          footer={
            <>
              <Button variant="secondary" onClick={closeModals} disabled={pendingAction === "ship"}>
                Đóng
              </Button>
              <Button
                variant="primary"
                loading={pendingAction === "ship"}
                onClick={() => {
                  handleAction("ship", {
                    carrier: shipFields.carrier || undefined,
                    tracking_code: shipFields.tracking || undefined,
                  });
                  closeModals();
                }}
              >
                Xác nhận giao hàng
              </Button>
            </>
          }
        >
          <div className="space-y-3">
            <div>
              <label htmlFor="ship-carrier" className="t-label text-ink">Đơn vị vận chuyển</label>
              <input
                id="ship-carrier"
                value={shipFields.carrier}
                onChange={(e) => setShipFields({ ...shipFields, carrier: e.target.value })}
                placeholder="Ví dụ: GHTK, J&T, Viettel Post..."
                className="mt-1 w-full rounded-control border border-input-line bg-surface px-3 t-body text-ink focus:border-focus focus:outline-none focus:ring-2 focus:ring-focus/30"
              />
            </div>
            <div>
              <label htmlFor="ship-tracking" className="t-label text-ink">Mã vận đơn</label>
              <input
                id="ship-tracking"
                value={shipFields.tracking}
                onChange={(e) => setShipFields({ ...shipFields, tracking: e.target.value })}
                placeholder="Mã theo dõi đơn vị vận chuyển"
                className="mt-1 w-full rounded-control border border-input-line bg-surface px-3 t-body text-ink focus:border-focus focus:outline-none focus:ring-2 focus:ring-focus/30"
              />
            </div>
          </div>
        </Dialog>
      )}

      {deliverChecks && (
        <Dialog
          open
          onClose={closeModals}
          title="Xác nhận giao hàng"
          dismissible={!pendingAction}
          footer={
            <>
              <Button variant="secondary" onClick={closeModals} disabled={pendingAction === "deliver"}>
                Đóng
              </Button>
              <Button
                variant="primary"
                loading={pendingAction === "deliver"}
                onClick={() => {
                  handleAction("deliver", {
                    buyer_confirmed_received: deliverChecks.received,
                    buyer_confirmed_paid: deliverChecks.paid,
                  });
                  closeModals();
                }}
              >
                Xác nhận
              </Button>
            </>
          }
        >
          <div className="space-y-3">
            <p className="t-body text-ink">
              {order.delivery_method === "MEETUP"
                ? "Xác nhận bạn đã gặp và nhận hàng từ người bán."
                : "Xác nhận bạn đã nhận hàng và đã chuyển khoản."}
            </p>
            <div className="space-y-3">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={deliverChecks.received}
                  onChange={(e) => setDeliverChecks({ ...deliverChecks, received: e.target.checked })}
                  className="h-4 w-4 rounded border-input-line text-brand focus:ring-focus"
                />
                <span className="t-body text-ink">Tôi đã nhận đủ hàng</span>
              </label>
              {order.delivery_method !== "MEETUP" && (
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={deliverChecks.paid}
                    onChange={(e) => setDeliverChecks({ ...deliverChecks, paid: e.target.checked })}
                    className="h-4 w-4 rounded border-input-line text-brand focus:ring-focus"
                  />
                  <span className="t-body text-ink">Tôi đã thanh toán cho người bán</span>
                </label>
              )}
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}

function OrderTimelineSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="flex gap-3">
          <div className="h-8 w-8 shrink-0 rounded-full bg-surface-subtle" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-1/4 bg-surface-subtle rounded-control" />
            <div className="h-4 w-1/2 bg-surface-subtle rounded-control" />
          </div>
        </div>
      ))}
    </div>
  );
}
