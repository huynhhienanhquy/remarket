import { useRef, useState } from "react";
import type { ProductImage } from "@remarket/shared";
import { useDialogBehavior } from "../Dialog/Dialog";
import { ChevronLeftIcon, ChevronRightIcon, XIcon } from "../Icon/Icon";
import { MarketplaceImage } from "../MarketplaceImage/MarketplaceImage";

export interface ImageViewerProps {
  images: ProductImage[];
  /** 0-based index of the photo the user clicked. */
  startIndex: number;
  onClose: () => void;
  /** Base alt text; the counter is appended so photos stay distinguishable. */
  alt: string;
}

function clampIndex(index: number, length: number): number {
  if (length === 0) return 0;
  if (index < 0) return 0;
  if (index > length - 1) return length - 1;
  return index;
}

const NAV_BUTTON =
  "absolute top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-surface/90 text-ink shadow-pop transition-colors hover:bg-surface disabled:opacity-40 disabled:cursor-not-allowed";

export function ImageViewer({ images, startIndex, onClose, alt }: ImageViewerProps) {
  const [index, setIndex] = useState(() => clampIndex(startIndex, images.length));
  const panelRef = useRef<HTMLDivElement | null>(null);

  useDialogBehavior({ open: images.length > 0, onClose, dismissible: true, panelRef });

  if (images.length === 0) return null;
  const current = images[clampIndex(index, images.length)];
  if (!current) return null;

  const isFirst = clampIndex(index, images.length) === 0;
  const isLast = clampIndex(index, images.length) === images.length - 1;

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      tabIndex={-1}
      className="fixed inset-0 z-dialog flex flex-col bg-ink/95 animate-fade-in"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-4 py-2">
        <p className="t-label text-white" aria-live="polite">
          {clampIndex(index, images.length) + 1}/{images.length}
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Đóng ảnh xem"
          className="flex h-11 w-11 items-center justify-center rounded-control text-white transition-colors hover:bg-white/10"
        >
          <XIcon />
        </button>
      </div>

      <div
        className="relative flex min-h-0 flex-1 items-center justify-center px-4 py-4 sm:px-16"
        onClick={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        <button
          type="button"
          disabled={isFirst}
          onClick={() => setIndex(clampIndex(index - 1, images.length))}
          aria-label="Ảnh trước"
          className={[NAV_BUTTON, "left-2"].join(" ")}
        >
          <ChevronLeftIcon />
        </button>
        <MarketplaceImage
          src={current.url}
          alt={images.length > 1 ? `${alt} — ảnh ${index + 1}/${images.length}` : alt}
          className="max-h-full max-w-full object-contain"
        />
        <button
          type="button"
          disabled={isLast}
          onClick={() => setIndex(clampIndex(index + 1, images.length))}
          aria-label="Ảnh sau"
          className={[NAV_BUTTON, "right-2"].join(" ")}
        >
          <ChevronRightIcon />
        </button>
      </div>

      <div className="scrollbar-thin flex shrink-0 gap-2 overflow-x-auto border-t border-white/10 p-3">
        {images.map((image, imageIndex) => {
          const active = imageIndex === index;
          return (
            <button
              key={image.id}
              type="button"
              onClick={() => setIndex(imageIndex)}
              aria-label={`Chọn ảnh ${imageIndex + 1}`}
              aria-current={active ? "true" : undefined}
              className={[
                "h-16 w-16 shrink-0 overflow-hidden rounded-control transition-opacity",
                active ? "outline outline-2 outline-brand" : "opacity-70 hover:opacity-100",
              ].join(" ")}
            >
              <MarketplaceImage src={image.url} variant="card" loading="lazy" alt="" className="h-full w-full object-cover" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
