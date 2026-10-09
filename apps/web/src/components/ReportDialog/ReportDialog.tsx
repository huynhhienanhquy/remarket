import { useEffect, useState } from "react";
import {
  REPORT_REASON_LABELS,
  REPORT_REASONS,
  validateReportDescription,
} from "@remarket/shared";
import type { ReportReason, ReportRequest } from "@remarket/shared";
import { api } from "../../services/api";
import { isApiError } from "../../helpers/errors";
import { Button, Dialog, FormField, Select, Textarea } from "../common";

export interface ReportDialogProps {
  open: boolean;
  onClose: () => void;
  target: Pick<ReportRequest, "target_type" | "product_id" | "user_id">;
  /** Short label of the reported object shown in the dialog header area. */
  targetLabel: string;
}

/**
 * Shared report modal (ui-spec 19): reason enum, description capped at 2.000
 * characters with `OTHER` required, duplicate pending reports surface inline
 * instead of resending the request.
 */
export function ReportDialog({ open, onClose, target, targetLabel }: ReportDialogProps) {
  const [reason, setReason] = useState<ReportReason | "">("");
  const [description, setDescription] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [descriptionError, setDescriptionError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState(false);
  const [pending, setPending] = useState(false);
  const [receipt, setReceipt] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setReason("");
      setDescription("");
      setReasonError(null);
      setDescriptionError(null);
      setSubmitError(null);
      setDuplicate(false);
      setReceipt(null);
    }
  }, [open]);

  const title =
    target.target_type === "product" ? "Báo cáo tin đăng" : "Báo cáo người dùng";

  async function submit() {
    setReasonError(null);
    setDescriptionError(null);
    setSubmitError(null);
    setDuplicate(false);

    if (reason === "") {
      setReasonError("Vui lòng chọn lý do báo cáo.");
      return;
    }
    const descriptionError = validateReportDescription(description.trim(), reason);
    if (descriptionError) {
      setDescriptionError(descriptionError);
      return;
    }

    setPending(true);
    try {
      const record = await api.reports.create({
        ...target,
        reason,
        description: description.trim() || undefined,
      });
      setReceipt(record.id);
    } catch (caught) {
      if (isApiError(caught) && caught.code === "VERSION_CONFLICT") {
        setDuplicate(true);
      } else {
        setSubmitError(isApiError(caught) ? caught.message : "Không gửi được báo cáo.");
      }
    } finally {
      setPending(false);
    }
  }

  if (receipt) {
    return (
      <Dialog
        open={open}
        onClose={onClose}
        title={title}
        footer={
          <Button variant="primary" onClick={onClose}>
            Đóng
          </Button>
        }
      >
        <div className="space-y-3">
          <p className="t-body text-ink">Báo cáo đã được gửi để xem xét.</p>
          <p className="t-meta text-muted">
            Mã báo cáo: <code className="break-all">{receipt}</code>
          </p>
          <p className="t-meta text-muted">
            Chúng tôi sẽ xem xét và phản hồi qua thông báo.
          </p>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      dismissible={!pending}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Hủy
          </Button>
          <Button variant="danger" loading={pending} onClick={submit}>
            Gửi báo cáo
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-control bg-surface-subtle px-4 py-3">
          <p className="t-meta text-muted">Đối tượng báo cáo</p>
          <p className="t-body text-ink">{targetLabel}</p>
        </div>

        <FormField label="Lý do" htmlFor="report-reason" required error={reasonError ?? undefined}>
          <Select
            id="report-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value as ReportReason | "")}
          >
            <option value="">Chọn lý do</option>
            {REPORT_REASONS.map((value) => (
              <option key={value} value={value}>
                {REPORT_REASON_LABELS[value]}
              </option>
            ))}
          </Select>
        </FormField>

        <FormField
          label="Mô tả chi tiết"
          htmlFor="report-description"
          required={reason === "OTHER"}
          helper={
            reason === "OTHER"
              ? "Bắt buộc khi chọn lý do khác."
              : "Tùy chọn; tối đa 2.000 ký tự."
          }
          error={descriptionError ?? undefined}
        >
          <Textarea
            id="report-description"
            value={description}
            maxLength={2000}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Mô tả hành vi bạn thấy vấn đề"
          />
        </FormField>

        <p className="t-meta text-right text-muted">{description.length}/2.000</p>

        {duplicate && (
          <p className="t-body text-danger" role="alert">
            Bạn đã có báo cáo đang chờ xử lý cho đối tượng này.
          </p>
        )}
        {submitError && (
          <p className="t-body text-danger" role="alert">
            {submitError}
          </p>
        )}
      </div>
    </Dialog>
  );
}
