import { useId, useState } from "react";
import { REVIEW_LIMITS } from "@remarket/shared";
import type { OrderDetail } from "@remarket/shared";
import { Button, ConfirmDialog, Dialog, FormField, Radio, StarIcon, Textarea, UserSummary } from "@/components/common";
import { OfflineNotice } from "@/components/common/PageFeedback/PageFeedback";
import { useOrderReview } from "../hooks/useOrderReview";

const ratingOptions = [
  { value: 1, label: "Rất tệ" }, { value: 2, label: "Tệ" },
  { value: 3, label: "Bình thường" }, { value: 4, label: "Tốt" }, { value: 5, label: "Rất tốt" },
];

export function ReviewDialog({ order, onClose }: { order: OrderDetail; onClose: () => void }) {
  const { rating, setRating, comment, setComment, fields, submitError, errorRef,
    pending, blocked, online, submit } = useOrderReview(order, onClose);
  const [discardOpen, setDiscardOpen] = useState(false);
  const fieldId = useId();

  function requestClose() {
    if (pending) return;
    if (rating !== null || comment !== "") setDiscardOpen(true);
    else onClose();
  }

  return (
    <>
      <Dialog open title="Đánh giá người bán" onClose={requestClose} dismissible={!pending && !discardOpen}
        footer={<>
          <Button variant="ghost" onClick={requestClose} disabled={pending || discardOpen}>Hủy</Button>
          <Button variant="primary" loading={pending} disabled={!online || blocked || discardOpen} onClick={submit}>
            Gửi đánh giá
          </Button>
        </>}>
        <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
          <UserSummary user={order.counterparty} size="lg" linkToProfile={false} />
          <p className="t-meta text-muted">Đơn hàng #{order.code.slice(0, 8).toUpperCase()}</p>
          <OfflineNotice online={online} />
          <fieldset disabled={pending || blocked || discardOpen} aria-describedby={fields.rating ? `${fieldId}-rating-error` : undefined}>
            <legend className="t-label text-ink mb-2">Số sao đánh giá (bắt buộc)</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {ratingOptions.map((option) => (
                <Radio key={option.value} name={`${fieldId}-rating`} value={option.value}
                  required
                  checked={rating === option.value} onChange={() => setRating(option.value)}
                  aria-invalid={!!fields.rating} aria-describedby={fields.rating ? `${fieldId}-rating-error` : undefined}
                  className="min-h-[44px] items-center rounded-control border border-line p-3"
                  label={<span className="flex flex-wrap items-center gap-2">
                    <span className="flex text-accent" aria-hidden="true">
                      {Array.from({ length: option.value }, (_, index) => <StarIcon key={index} size={16} />)}
                    </span>
                    <span>{option.value} sao — {option.label}</span>
                  </span>} />
              ))}
            </div>
            {fields.rating && <p id={`${fieldId}-rating-error`} className="mt-2 t-meta text-danger">{fields.rating}</p>}
          </fieldset>
          <FormField label="Nhận xét" htmlFor={`${fieldId}-comment`} helper="Tùy chọn; tối đa 1.000 ký tự." error={fields.comment}>
            <Textarea id={`${fieldId}-comment`} value={comment} maxLength={REVIEW_LIMITS.commentMax}
              disabled={pending || blocked || discardOpen} onChange={(event) => setComment(event.target.value)} rows={4} />
          </FormField>
          <p className="t-meta text-right text-muted">{comment.length}/1.000</p>
          <p className="t-meta text-muted">Mỗi đơn chỉ được đánh giá một lần. Đánh giá đã gửi không thể chỉnh sửa.</p>
          {submitError && <div ref={errorRef} tabIndex={-1} role="alert" className="t-body text-danger">{submitError}</div>}
        </form>
      </Dialog>
      {discardOpen && <ConfirmDialog title="Bỏ nội dung đánh giá?" description="Nội dung chưa gửi sẽ không được lưu."
        confirmLabel="Bỏ đánh giá" cancelLabel="Tiếp tục viết" onCancel={() => setDiscardOpen(false)} onConfirm={onClose} />}
    </>
  );
}
