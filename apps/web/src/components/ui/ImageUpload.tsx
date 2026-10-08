import { useId, useState } from "react";
import { PlusIcon } from "./icons";
import { api } from "../../lib/api";

const SUPPORTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export interface ImageUploadProps {
  onUpload: (upload: { url: string; storage_path: string }) => void;
  accept?: string;
  maxSize?: number;
  className?: string;
  /** Set when an image is already being uploaded (prevents double-click). */
  isUploading?: boolean;
}

export function ImageUpload({
  onUpload,
  accept = "image/jpeg,image/png,image/webp",
  maxSize = 5 * 1024 * 1024,
  className,
  isUploading = false,
}: ImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const inputId = useId();

  const handleChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;

    if (!SUPPORTED_IMAGE_TYPES.has(file.type)) {
      alert("Định dạng ảnh không được hỗ trợ. Chỉ chấp nhận JPG, PNG, WebP.");
      input.value = "";
      return;
    }
    if (file.size > maxSize) {
      alert(`Ảnh tối đa ${Math.round(maxSize / 1024 / 1024)} MB.`);
      input.value = "";
      return;
    }

    setUploading(true);
    try {
      // Use the selected app adapter. In mock mode this creates a local preview;
      // in live mode the HTTP adapter sends authenticated multipart/form-data.
      const data = await api.uploads.upload(file, "product");

      if (!data.url || !data.storage_path) throw new Error("Phản hồi tải ảnh không hợp lệ.");

      onUpload({ url: data.url, storage_path: data.storage_path });
    } catch (error: unknown) {
      alert(error instanceof Error ? error.message : "Tải ảnh thất bại. Vui lòng thử lại.");
    } finally {
      setUploading(false);
      input.value = "";
    }
  };

  return (
    <label
      htmlFor={inputId}
      className={[
        "relative aspect-square flex items-center justify-center cursor-pointer",
        "rounded-lg border-2 border-dashed border-input-line",
        "bg-surface hover:bg-surface-subtle transition-colors",
        "group",
        className ?? "",
      ].join(" ")}
    >
      <input
        id={inputId}
        type="file"
        accept={accept}
        className="absolute inset-0 z-10 h-full w-full opacity-0 cursor-pointer"
        onChange={handleChange}
        disabled={isUploading || uploading}
      />
      {uploading || isUploading ? (
        <div className="flex flex-col items-center gap-2 text-muted">
          <div className="rm-spinner h-8 w-8" />
          <span className="text-sm">Đang tải...</span>
        </div>
      ) : (
        <>
          <PlusIcon className="h-10 w-10 text-muted group-hover:text-ink transition-colors" />
          <p className="absolute bottom-2 left-2 right-2 text-center text-xs text-muted bg-black/50 px-2 py-1 rounded">
            Thêm ảnh
          </p>
        </>
      )}
    </label>
  );
}
