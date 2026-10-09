import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { validateReviewComment } from "@remarket/shared";
import type { OrderDetail } from "@remarket/shared";
import { api } from "@/services/api";
import { queryKeys } from "@/config/queryClient";
import { apiFieldErrors, isApiError } from "@/helpers/errors";
import { useConnectivity } from "@/hooks/useConnectivity";
import { useToast } from "@/components/common";

export function useOrderReview(order: OrderDetail, onClose: () => void) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const online = useConnectivity();
  const [rating, setRating] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);
  const submitting = useRef(false);
  const errorRef = useRef<HTMLDivElement | null>(null);
  const mutation = useMutation({
    mutationFn: (input: { rating: number; comment: string | null }) => api.reviews.create(order.id, input),
    retry: false,
  });

  async function submit() {
    if (submitting.current || blocked || !online) return;
    const nextFields: Record<string, string> = {};
    if (rating === null) nextFields.rating = "Vui lòng chọn số sao đánh giá.";
    const commentError = validateReviewComment(comment.trim());
    if (commentError) nextFields.comment = commentError;
    setFields(nextFields);
    setSubmitError(null);
    if (Object.keys(nextFields).length > 0 || rating === null) {
      setSubmitError("Vui lòng kiểm tra thông tin đánh giá.");
      requestAnimationFrame(() => errorRef.current?.focus());
      return;
    }
    submitting.current = true;
    try {
      const review = await mutation.mutateAsync({ rating, comment: comment.trim() || null });
      // Record the committed review before refetching so it cannot be sent twice.
      queryClient.setQueryData<OrderDetail>(queryKeys.order(order.id), (current) => current ? {
        ...current,
        allowed_actions: current.allowed_actions.filter((action) => action !== "review"),
        review: { can_review: false, reason: "Bạn đã đánh giá đơn hàng này.", existing: review },
      } : current);
      for (const queryKey of [["orders"], ["profiles"], ["products"], ["admin", "reviews"], ["notifications"]]) {
        void queryClient.invalidateQueries({ queryKey });
      }
      onClose();
      toast.success("Đã gửi đánh giá người bán.");
    } catch (error) {
      setFields(apiFieldErrors(error) ?? {});
      setSubmitError(isApiError(error)
        ? error.isNetwork
          ? "Không thể kết nối máy chủ. Nội dung được giữ lại; hãy kiểm tra kết nối rồi thử lại."
          : error.message
        : "Không gửi được đánh giá. Vui lòng thử lại.");
      if (isApiError(error) && error.code === "REVIEW_NOT_ALLOWED") {
        setBlocked(true);
        void queryClient.invalidateQueries({ queryKey: queryKeys.order(order.id) });
      }
      requestAnimationFrame(() => errorRef.current?.focus());
    } finally {
      submitting.current = false;
    }
  }

  return { rating, setRating, comment, setComment, fields, submitError, errorRef,
    pending: mutation.isPending, blocked, online, submit };
}
