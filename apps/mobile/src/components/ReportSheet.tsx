import { useEffect, useState } from "react";
import {
  REPORT_REASONS,
  REPORT_REASON_LABELS,
  validateReportDescription,
} from "@remarket/shared";
import type { ReportReason } from "@remarket/shared";
import { api } from "../services/runtime";
import { Sheet } from "./Sheet";
import { SelectField } from "./SelectField";
import { Button, Feedback, Field, useAction } from "./ui";

export function ReportSheet({
  target,
  onClose,
}: {
  target: { type: "product" | "user"; id: string } | null;
  onClose: () => void;
}) {
  const [reason, setReason] = useState<ReportReason>("OTHER");
  const [description, setDescription] = useState("");
  const action = useAction();
  useEffect(() => {
    setDescription("");
    setReason("OTHER");
  }, [target?.id]);
  return (
    <Sheet visible={!!target} title="Báo cáo vi phạm" onClose={onClose}>
      <SelectField
        label="Lý do báo cáo"
        value={reason}
        items={REPORT_REASONS.map((value) => ({
          value,
          label: REPORT_REASON_LABELS[value],
        }))}
        onChange={(value) => {
          const valid = REPORT_REASONS.find((item) => item === value);
          if (valid) setReason(valid);
        }}
      />
      <Field
        label="Mô tả chi tiết"
        hint="Mô tả sự việc để quản trị viên có thể xem xét."
        value={description}
        onChangeText={setDescription}
        multiline
        maxLength={2000}
      />
      <Feedback error={action.error} />
      <Button
        title="Gửi báo cáo"
        loading={action.pending}
        onPress={() => {
          void action.run(async () => {
            if (!target) return;
            const error = validateReportDescription(description, reason);
            if (error) throw new Error(error);
            await api.reports.create({
              target_type: target.type,
              ...(target.type === "product"
                ? { product_id: target.id }
                : { user_id: target.id }),
              reason,
              description: description.trim() || undefined,
            });
            onClose();
          }, "Đã gửi báo cáo để quản trị viên xem xét.");
        }}
      />
    </Sheet>
  );
}
