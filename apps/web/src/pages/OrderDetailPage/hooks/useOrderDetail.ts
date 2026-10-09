import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ORDER_STATUS_LABELS } from "@remarket/shared";
import { api } from "@/services/api";
import { queryKeys } from "@/config/queryClient";
import { useSession } from "@/contexts/SessionContext";
import { isApiError } from "@/helpers/errors";
import { useConnectivity } from "@/hooks/useConnectivity";

/**
 * Owns order actions, version-conflict feedback and modal state; server permissions remain authoritative.
 * Called once by the route component; hook order and handlers match the original page.
 */
export function useOrderDetail(role: "buyer" | "seller") {
  const { id = "" } = useParams();
  const queryClient = useQueryClient();
  const { viewer } = useSession();
  const online = useConnectivity();

  const [confirmOpen, setConfirmOpen] = useState<{ action: string; reason: string } | null>(null);
  const [shipFields, setShipFields] = useState<{ carrier: string; tracking: string } | null>(null);
  const [deliverChecks, setDeliverChecks] = useState<{ received: boolean; paid: boolean } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);

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
  const reviewBlockReason = order?.review.existing ? null
    : order?.review.reason ?? (viewer?.status === "LOCKED" ? "Tài khoản đang bị hạn chế nên không thể đánh giá."
    : !viewer?.email_verified_at ? "Vui lòng xác minh email trước khi đánh giá."
    : null);
  const canReview = isBuyer && order?.status === "COMPLETED" &&
    order.review.can_review && !order.review.existing &&
    myAllowedActions.includes("review") && reviewBlockReason === null;

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
  return {
    online,
    confirmOpen,
    setConfirmOpen,
    shipFields,
    setShipFields,
    deliverChecks,
    setDeliverChecks,
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
    setReviewOpen,
    timelineSteps,
    handleAction,
    openConfirm,
    openShip,
    openDeliver,
    closeModals,
  };
}
