import type { useOrderDetail } from "../hooks/useOrderDetail";
import { Button, ConfirmDialog, Dialog } from "../../../components/common";
type Model = Pick<ReturnType<typeof useOrderDetail>, "order" | "confirmOpen" | "changeCancelReason" | "shipFields" | "changeShipping" | "deliverOpen" | "pendingAction" | "handleAction" | "closeModals">;
export function OrderActionDialogs({ model }: { model: Model }) {
  const { order, confirmOpen, changeCancelReason, shipFields, changeShipping, deliverOpen, pendingAction, handleAction, closeModals } = model;
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
          <p className="t-body text-muted">
            Mã vận đơn sẽ được tạo tự động khi bạn xác nhận giao hàng.
          </p>
        </div>
      </Dialog>
    )}

    {deliverOpen && (
      <ConfirmDialog
        open
        onCancel={closeModals}
        title="Ghi nhận đã giao hàng"
        description={order.delivery_method === "MEETUP"
          ? "Xác nhận bạn đã gặp và giao hàng cho người mua. Người mua sẽ kiểm tra hàng và xác nhận hoàn tất."
          : "Xác nhận đơn hàng đã được giao cho người mua. Người mua sẽ kiểm tra hàng và xác nhận hoàn tất."}
        confirmLabel="Ghi nhận đã giao"
        cancelLabel="Đóng"
        tone="primary"
        loading={pendingAction === "deliver"}
        onConfirm={() => {
          handleAction("deliver", {});
          closeModals();
        }}
      />
    )}</>;
}
