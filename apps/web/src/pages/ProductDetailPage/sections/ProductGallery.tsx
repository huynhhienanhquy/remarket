import type { ProductDetail } from "@remarket/shared";
import { MarketplaceImage } from "../../../components/common";

interface ProductGalleryProps {
  product: ProductDetail; hidden: boolean; images: ProductDetail["images"];
  mainImage: ProductDetail["images"][number] | undefined; activeImage: number;
  openViewer: () => void; selectImage: (index: number) => void;
}
export function ProductGallery({ product, hidden, images, mainImage, activeImage, openViewer, selectImage }: ProductGalleryProps) {
  return (<div className="lg:col-span-7">
    {hidden ? (
      <div className="flex aspect-[4/3] flex-col items-center justify-center gap-2 rounded-card bg-surface-subtle">
        <p className="t-h3 text-muted">Tin đăng không còn khả dụng</p>
      </div>
    ) : (
      <>
        <button
          type="button"
          onClick={openViewer}
          className="block w-full"
          aria-label="Xem ảnh lớn"
        >
          <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-card bg-surface-subtle">
            {mainImage ? (
              <MarketplaceImage
                src={mainImage.url}
                variant="detail"
                alt={`${product.title} — ảnh ${activeImage + 1}`}
                className="h-full w-full object-contain"
              />
            ) : (
              <span className="t-body text-muted">Chưa có ảnh</span>
            )}
          </div>
        </button>
        {images.length > 1 && (
          <div className="scrollbar-thin mt-3 flex gap-2 overflow-x-auto pb-1">
            {images.map((image, index) => (
              <button
                key={image.id}
                type="button"
                onClick={() => selectImage(index)}
                aria-label={`Ảnh ${index + 1}`}
                aria-current={index === activeImage}
                className={[
                  "h-16 w-16 shrink-0 overflow-hidden rounded-control border-2 bg-surface-subtle",
                  index === activeImage ? "border-brand" : "border-transparent",
                ].join(" ")}
              >
                <MarketplaceImage
                  src={image.url}
                  variant="card"
                  loading="lazy"
                  alt=""
                  className="h-full w-full object-cover"
                />
              </button>
            ))}
          </div>
        )}
      </>
    )}
  </div>);
}
