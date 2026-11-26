import { useId, useRef, useState } from "react";
import { PRODUCT_LIMITS } from "@remarket/shared";
import { Button } from "../../../components/common/Button/Button";
import { ImageIcon } from "../../../components/common/Icon/Icon";
import { QueryFailure } from "../../../components/common/PageFeedback/PageFeedback";
import { api } from "../../../services/api";

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

export function ProductImageUpload({ disabled, imageCount, onBusyChange, onUpload }: {
  disabled: boolean;
  imageCount: number;
  onBusyChange: (busy: boolean) => void;
  onUpload: (upload: { url: string; storage_path: string }) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const uploading = useRef(false);
  const hintId = useId();
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const remaining = PRODUCT_LIMITS.imagesMax - imageCount;
  const unavailable = disabled || busy || remaining <= 0;

  async function uploadFiles(files: File[]) {
    if (!files.length || disabled || uploading.current || remaining <= 0) return;
    setError(null);
    if (files.length > remaining) {
      setValidationError(`Bạn có thể thêm tối đa ${remaining} ảnh nữa.`);
      return;
    }
    if (files.some((file) => !IMAGE_TYPES.includes(file.type) || file.size > MAX_IMAGE_SIZE)) {
      setValidationError("Chọn ảnh JPG, PNG hoặc WebP, tối đa 5 MB mỗi ảnh.");
      return;
    }

    setValidationError(null);
    uploading.current = true;
    setBusy(true);
    onBusyChange(true);
    try {
      for (const file of files) onUpload(await api.uploads.upload(file, "product"));
    } catch (caught) {
      setError(caught);
    } finally {
      uploading.current = false;
      setBusy(false);
      onBusyChange(false);
    }
  }

  return (
    <div className="space-y-2">
      <div
        className={`flex min-h-[180px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-3 py-5 text-center transition-colors min-[600px]:min-h-[252px] ${dragging && !unavailable ? "border-brand bg-brand-soft" : "border-input-line/65 bg-[#f6f6fa]"}`}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = unavailable ? "none" : "copy";
          if (!unavailable) setDragging(true);
        }}
        onDragLeave={(event) => {
          if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) {
            setDragging(false);
          }
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void uploadFiles(Array.from(event.dataTransfer.files));
        }}
      >
        <ImageIcon size={38} className="text-muted" />
        <p className="text-[13px] font-medium leading-5 text-ink">
          {remaining > 0 ? "Kéo thả hoặc bấm để chọn ảnh" : "Đã thêm đủ số ảnh tối đa"}
        </p>
        <input
          ref={input}
          type="file"
          accept={IMAGE_TYPES.join(",")}
          aria-label="Chọn ảnh sản phẩm"
          className="hidden"
          multiple
          disabled={unavailable}
          onChange={(event) => {
            const files = Array.from(event.currentTarget.files ?? []);
            event.currentTarget.value = "";
            void uploadFiles(files);
          }}
        />
        <Button
          variant="secondary"
          className="!rounded-full !border-brand/20 !bg-brand-soft enabled:hover:!border-brand/50"
          aria-describedby={hintId}
          disabled={unavailable}
          loading={busy}
          onClick={() => input.current?.click()}
        >
          <span className="flex items-center gap-2"><ImageIcon size={17} />Chọn ảnh</span>
        </Button>
        <p id={hintId} className="t-meta text-muted">
          {imageCount > 0 ? `${imageCount}/${PRODUCT_LIMITS.imagesMax} ảnh` : `Tối đa ${PRODUCT_LIMITS.imagesMax} ảnh`} · 5 MB/ảnh
        </p>
        {busy && <p role="status" className="t-meta text-muted">Đang tải ảnh…</p>}
      </div>
      {validationError && <p className="t-meta text-danger" role="alert">{validationError}</p>}
      {error !== null && <QueryFailure error={error} />}
    </div>
  );
}
