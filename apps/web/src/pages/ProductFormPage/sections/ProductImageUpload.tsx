import { useState } from "react";
import { api } from "../../../services/api";
import { FormField, Input } from "../../../components/common";
import { QueryFailure } from "../../../components/common/PageFeedback/PageFeedback";
import { ApiError } from "../../../helpers/errors";

export function ProductImageUpload({ disabled, onBusyChange, onUpload }: {
  disabled: boolean;
  onBusyChange: (busy: boolean) => void;
  onUpload: (upload: { url: string; storage_path: string }) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  return <div className="space-y-2"><FormField label="Thêm ảnh" htmlFor="product-add-image" helper="JPG, PNG, WebP · Tối đa 5 MB">
    <Input id="product-add-image" type="file" accept="image/jpeg,image/png,image/webp" disabled={disabled || busy} onChange={async (event) => {
      const file = event.target.files?.[0]; event.target.value = ""; if (!file || disabled || busy) return;
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) {
        setError(new ApiError({ code: "VALIDATION_ERROR", status: 422, message: "Ảnh cần là JPG, PNG hoặc WebP và không quá 5 MB." })); return;
      }
      setError(null); setBusy(true); onBusyChange(true);
      try { onUpload(await api.uploads.upload(file, "product")); }
      catch (caught) { setError(caught); }
      finally { setBusy(false); onBusyChange(false); }
    }} />
  </FormField>{busy && <p role="status">Đang tải ảnh…</p>}{error !== null && <QueryFailure error={error} />}</div>;
}
