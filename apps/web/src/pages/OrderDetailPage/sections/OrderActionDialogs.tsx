import type { useOrderDetail } from "../hooks/useOrderDetail";
import { Button, ConfirmDialog, Dialog } from "../../../components/common";
type Model = Pick<ReturnType<typeof useOrderDetail>, "order" | "confirmOpen" | "changeCancelReason" | "shipFields" | "changeShipping" | "deliverChecks" | "changeDelivery" | "pendingAction" | "handleAction" | "closeModals">;
export function OrderActionDialogs({ model }: { model: Model }) {
  const { order, confirmOpen, changeCancelReason, shipFields, changeShipping, deliverChecks, changeDelivery, pendingAction, handleAction, closeModals } = model;
  if (!order) return null;
  return <>{confirmOpen && (
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
            onChange: changeCancelReason,
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
              onChange={(e) => changeShipping({ carrier: e.target.value })}
              placeholder="Ví dụ: GHTK, J&T, Viettel Post..."
              className="mt-1 w-full rounded-control border border-input-line bg-surface px-3 t-body text-ink focus:border-focus focus:outline-none focus:ring-2 focus:ring-focus/30"
            />
          </div>
          <div>
            <label htmlFor="ship-tracking" className="t-label text-ink">Mã vận đơn</label>
            <input
              id="ship-tracking"
              value={shipFields.tracking}
              onChange={(e) => changeShipping({ tracking: e.target.value })}
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
                onChange={(e) => changeDelivery({ received: e.target.checked })}
                className="h-4 w-4 rounded border-input-line text-brand focus:ring-focus"
              />
              <span className="t-body text-ink">Tôi đã nhận đủ hàng</span>
            </label>
            {order.delivery_method !== "MEETUP" && (
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={deliverChecks.paid}
                  onChange={(e) => changeDelivery({ paid: e.target.checked })}
                  className="h-4 w-4 rounded border-input-line text-brand focus:ring-focus"
                />
                <span className="t-body text-ink">Tôi đã thanh toán cho người bán</span>
              </label>
            )}
          </div>
        </div>
      </Dialog>
    )}</>;
}
