import {
  DELIVERY_LABELS,
  formatDateTime,
  formatVnd,
  ORDER_ACTION_LABELS,
  ORDER_STATUS_LABELS,
  primaryOrderAction,
} from "@remarket/shared";
import { Link } from "react-router-dom";
import {
  Button,
  EmptyState,
  InlineAlert,
  OrderTimeline,
  StatusBadge,
  UserSummary,
  useToast
} from "../../components/common";
import { OfflineNotice } from "../../components/common/PageFeedback/PageFeedback";
import { isApiError } from "../../helpers/errors";
import { useOrderDetail } from "./hooks/useOrderDetail";
import { OrderActionDialogs } from "./sections/OrderActionDialogs";
import { OrderContents } from "./sections/OrderContents";
import { OrderTimelineSkeleton } from "./sections/OrderTimelineSkeleton";
import { ReviewDialog } from "./sections/ReviewDialog";

type Role = "buyer" | "seller";

interface OrderDetailPageProps {
  role: Role;
}

export function OrderDetailPage({ role }: OrderDetailPageProps) {
  const toast = useToast();
  const model = useOrderDetail(role);
  const {
    online,
    actionError,
    pendingAction,
    detail,
    order,
    isBuyer,
    counterparty,
    canConfirm,
    canCancel,
    canShip,
    canDeliver,
    canComplete,
    canReview,
    reviewBlockReason,
    reviewOpen,
    openReview,
    closeReview,
    timelineSteps,
    handleAction,
    openConfirm,
    openShip,
    openDeliver,
  } = model;

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
  const suggestedAction = primaryOrderAction({
    status: order.status,
    role: isBuyer ? "buyer" : "seller",
    delivery: order.delivery_method,
  });
  const nextAction = suggestedAction === "review" && !canReview ? null : suggestedAction;

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
              onClick={() => {
                void (async () => {
                  try { await navigator.clipboard.writeText(order.id); toast.success("Đã sao chép mã đơn."); }
                  catch { toast.error("Không thể sao chép mã đơn. Vui lòng sao chép thủ công."); }
                })();
              }}
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

          <OrderContents order={order} />

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

              {canReview && (
                <Button
                  variant="secondary"
                  fullWidth
                  disabled={!online}
                  onClick={openReview}
                >
                  Đánh giá người bán
                </Button>
              )}

              {order.status === "COMPLETED" && (
                order.review.existing ? (
                  <div className="rounded-control bg-surface-subtle p-3 space-y-2">
                    <p className="t-label text-ink">{isBuyer ? "Đánh giá đã gửi" : "Đánh giá từ người mua"}: {order.review.existing.rating}/5 sao</p>
                    {!isBuyer && <p className="t-meta text-muted">Người đánh giá: {order.review.existing.reviewer.name}</p>}
                    {order.review.existing.comment && <p className="t-body text-ink whitespace-pre-wrap break-words">{order.review.existing.comment}</p>}
                    <time dateTime={order.review.existing.created_at} className="t-meta text-muted">
                      {formatDateTime(order.review.existing.created_at)}
                    </time>
                    <p className="t-meta text-muted">{isBuyer ? "Đánh giá đã gửi không thể chỉnh sửa." : "Đánh giá của người mua chỉ có thể xem."}</p>
                  </div>
                ) : <p className="t-meta text-muted">{isBuyer ? reviewBlockReason : "Người mua chưa đánh giá đơn hàng này."}</p>
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

      <OrderActionDialogs model={model} />

      {reviewOpen && canReview && <ReviewDialog key={order.id} order={order} onClose={closeReview} />}

    </div>
  );
}
