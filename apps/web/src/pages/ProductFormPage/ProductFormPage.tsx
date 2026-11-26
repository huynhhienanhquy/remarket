import { useId } from "react";
import { useProductForm } from "./hooks/useProductForm";
import type { Condition, DeliveryMethod, OwnProduct } from "@remarket/shared";
import { ConfirmDialog } from "../../components/common/Dialog/Dialog";
import { Button } from "../../components/common/Button/Button";
import { ApiImage } from "../../components/common/ApiImage/ApiImage";
import { Input, Select, Textarea } from "../../components/common/Input/Input";
import { FormField } from "../../components/common/FormField/FormField";
import { MoneyInput } from "../../components/common/MoneyInput/MoneyInput";
import { XIcon } from "../../components/common/Icon/Icon";
import { Skeleton } from "../../components/common/Skeleton/Skeleton";
import { InlineAlert } from "../../components/common/InlineAlert/InlineAlert";
import { CONDITIONS, DELIVERY_METHODS, PRODUCT_LIMITS, conditionLabel, deliveryLabel } from "@remarket/shared";
import { OfflineNotice, QueryFailure } from "../../components/common/PageFeedback/PageFeedback";
import { ProductImageUpload } from "./sections/ProductImageUpload";

const CONTROL = "!border-[#d9dde4] !bg-[#fafafa] aria-[invalid=true]:!border-danger hover:!border-brand min-[600px]:!text-sm";

export function ProductFormPage() {
  const {
    id,
    mode,
    navigate,
    online,
    form,
    setForm,
    errors,
    submitting,
    uploading,
    setUploading,
    existingProduct,
    loadError,
    retryLoad,
    deleteOpen,
    cancelDelete,
    confirmDelete,
    categoryQuery,
    provinces,
    flatCategories,
    saveMutation,
    submitAction,
    hideAction,
    deleteAction,
    handleSubmit,
    handleAction,
  } = useProductForm();
  const detailsId = useId();
  const shippingId = useId();

  function patch<Key extends keyof typeof form>(key: Key, value: (typeof form)[Key]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  if (mode === "edit" && !existingProduct) {
    if (loadError) return <QueryFailure error={loadError} retry={retryLoad} />;
    return <Skeleton className="space-y-4 h-[500px]" />;
  }
  if (existingProduct && !existingProduct.capabilities.can_edit) return <InlineAlert tone="warning" title="Không thể chỉnh sửa tin này">Tin đang được giữ, đã bán hoặc bị hạn chế. <Button onClick={() => navigate("/account/products")}>Quay lại tin đăng</Button></InlineAlert>;

  return (
    <div className="mx-auto max-w-[760px] space-y-4">
      <ConfirmDialog open={deleteOpen} title="Xóa tin đăng?" description="Lịch sử giao dịch vẫn được giữ."
        confirmLabel="Xóa tin đăng" loading={deleteAction.isPending} onCancel={cancelDelete} onConfirm={() => void confirmDelete()} />
      <OfflineNotice online={online} />
      {categoryQuery.isError && <QueryFailure error={categoryQuery.error} retry={() => void categoryQuery.refetch()} />}
      {provinces.isError && <QueryFailure error={provinces.error} retry={() => void provinces.refetch()} />}
      {saveMutation.isError && <QueryFailure error={saveMutation.error} />}

      <form onSubmit={handleSubmit} className="rm-account-card p-4 sm:p-6" noValidate>
        <h1 className="t-h1 text-ink">{mode === "create" ? "Đăng sản phẩm" : "Chỉnh sửa tin đăng"}</h1>
        <section aria-labelledby={`${detailsId}-heading`} className="py-5">
          <h2 id={`${detailsId}-heading`} className="mb-4 t-h3 text-ink">Thông tin sản phẩm</h2>
          <div className="grid items-start gap-5 min-[600px]:grid-cols-[minmax(0,0.64fr)_minmax(0,1fr)] sm:gap-6">
            <div className="min-w-0 space-y-3">
              <ProductImageUpload
                disabled={submitting || !online}
                imageCount={form.images.length}
                onBusyChange={setUploading}
                onUpload={(upload) => {
                  setForm((current) => ({
                    ...current,
                    images: [...current.images, { ...upload, sort_order: current.images.length }].slice(0, PRODUCT_LIMITS.imagesMax),
                  }));
                }}
              />
              {errors.images && <p className="t-meta text-danger" role="alert">{errors.images}</p>}
              {form.images.length > 0 && (
                <ul aria-label="Ảnh đã tải lên" className="grid grid-cols-3 gap-2">
                  {form.images.map((image, index) => (
                    <li key={index} className="relative aspect-square overflow-hidden rounded-lg border border-line bg-surface-subtle">
                      {image.url && <ApiImage src={image.url} alt={`Ảnh ${index + 1}`} className="h-full w-full object-cover" />}
                      <button
                        type="button"
                        aria-label={`Xóa ảnh ${index + 1}`}
                        disabled={submitting || uploading}
                        className="absolute right-0 top-0 grid h-11 w-11 place-items-center disabled:opacity-50"
                        onClick={() => {
                          setForm((current) => ({
                            ...current,
                            images: current.images.filter((_, position) => position !== index)
                              .map((item, sort_order) => ({ ...item, sort_order })),
                          }));
                        }}
                      >
                        <span className="grid h-7 w-7 place-items-center rounded-full bg-ink/75 text-white"><XIcon size={16} /></span>
                      </button>
                      {index === 0 && <span className="absolute bottom-1 left-1 rounded bg-ink/75 px-1.5 text-[10px] text-white">Ảnh bìa</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="min-w-0 space-y-3 min-[600px]:space-y-2">
              <FormField label="Tên sản phẩm" htmlFor={`${detailsId}-title`} required error={errors.title}>
                <Input
                  id={`${detailsId}-title`}
                  className={CONTROL}
                  value={form.title}
                  onChange={(event) => patch("title", event.target.value)}
                  placeholder="Nhập tên sản phẩm"
                  maxLength={PRODUCT_LIMITS.titleMax}
                />
              </FormField>

              <FormField label="Danh mục" htmlFor={`${detailsId}-category`} required error={errors.category_id}>
                <Select id={`${detailsId}-category`} className={CONTROL} value={form.category_id} onChange={(event) => patch("category_id", event.target.value)}>
                  <option value="" disabled>Chọn danh mục</option>
                  {flatCategories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.parentName ? `${category.parentName} / ${category.name}` : category.name}
                    </option>
                  ))}
                </Select>
              </FormField>

              <div className="grid grid-cols-2 gap-3">
                <div className="relative min-w-0">
                  <FormField label="Giá bán" htmlFor={`${detailsId}-price`} required error={errors.price}>
                    <MoneyInput
                      id={`${detailsId}-price`}
                      className={`${CONTROL} pr-8`}
                      value={form.price}
                      onValueChange={(value) => patch("price", value)}
                      placeholder="Nhập giá bán"
                    />
                  </FormField>
                  <span aria-hidden="true" className="pointer-events-none absolute right-3 top-[46px] -translate-y-1/2 text-sm text-muted">₫</span>
                </div>
                <FormField label="Tình trạng" htmlFor={`${detailsId}-condition`} required error={errors.condition}>
                  <Select
                    id={`${detailsId}-condition`}
                    className={CONTROL}
                    value={form.condition}
                    onChange={(event) => patch("condition", event.target.value as Condition)}
                  >
                    {CONDITIONS.map((condition) => (
                      <option key={condition} value={condition}>{conditionLabel(condition)}</option>
                    ))}
                  </Select>
                </FormField>
              </div>

              <FormField label="Địa điểm" htmlFor={`${detailsId}-location`} required error={errors.province_code}>
                <Select
                  id={`${detailsId}-location`}
                  className={CONTROL}
                  value={form.province_code}
                  onChange={(event) => patch("province_code", event.target.value)}
                >
                  <option value="" disabled>Chọn tỉnh/thành phố</option>
                  {provinces.data?.map((province) => (
                    <option key={province.code} value={province.code}>{province.name}</option>
                  ))}
                </Select>
              </FormField>

              <FormField label="Mô tả sản phẩm" htmlFor={`${detailsId}-description`} required error={errors.description}>
                <Textarea
                  id={`${detailsId}-description`}
                  className={`${CONTROL} !min-h-[80px]`}
                  value={form.description}
                  onChange={(event) => patch("description", event.target.value)}
                  placeholder="Nhập mô tả chi tiết về sản phẩm…"
                  rows={3}
                  maxLength={PRODUCT_LIMITS.descriptionMax}
                />
              </FormField>

              <details open={errors.usage_months ? true : undefined}>
                <summary className="w-fit cursor-pointer py-1 text-sm text-muted hover:text-brand">Số tháng đã dùng (không bắt buộc)</summary>
                <FormField label="Số tháng đã dùng" htmlFor={`${detailsId}-usage`} error={errors.usage_months} className="mt-2">
                  <Input
                    id={`${detailsId}-usage`}
                    className={CONTROL}
                    type="number"
                    min={0}
                    max={PRODUCT_LIMITS.usageMonthsMax}
                    value={form.usage_months ?? ""}
                    onChange={(event) => patch("usage_months", event.target.value ? Number(event.target.value) : null)}
                    placeholder="Nhập số tháng"
                  />
                </FormField>
              </details>
            </div>
          </div>
        </section>

        <section aria-labelledby={`${shippingId}-heading`} className="border-t border-line py-5">
          <h2 id={`${shippingId}-heading`} className="mb-4 t-h3 text-ink">Hình thức vận chuyển</h2>
          <div className="grid items-start gap-4 min-[600px]:grid-cols-2">
            <FormField label="Hình thức giao nhận" htmlFor={`${shippingId}-method`} required error={errors.delivery_method}>
              <Select
                id={`${shippingId}-method`}
                className={CONTROL}
                value={form.delivery_method}
                onChange={(event) => {
                  const method = event.target.value as DeliveryMethod;
                  setForm((current) => ({
                    ...current,
                    delivery_method: method,
                    shipping_fee: method === "MEETUP" ? "0" : current.shipping_fee,
                  }));
                }}
              >
                {DELIVERY_METHODS.map((method) => (
                  <option key={method} value={method}>{deliveryLabel(method)}</option>
                ))}
              </Select>
            </FormField>
            <FormField
              label="Phí giao hàng (₫)"
              htmlFor={`${shippingId}-fee`}
              required={form.delivery_method !== "MEETUP"}
              error={errors.shipping_fee}
              helper={form.delivery_method === "MEETUP" ? "Gặp trực tiếp không tính phí giao hàng." : undefined}
            >
              <MoneyInput
                id={`${shippingId}-fee`}
                className={`${CONTROL} disabled:opacity-60`}
                value={form.shipping_fee}
                onValueChange={(value) => patch("shipping_fee", value)}
                disabled={form.delivery_method === "MEETUP"}
                placeholder="Nhập phí giao hàng"
              />
            </FormField>
          </div>
        </section>

        <div className="flex items-center justify-end gap-3 border-t border-line pt-4">
          <Button variant="secondary" className="!border-line !text-ink" onClick={() => navigate("/account/products")}>
            Hủy
          </Button>
          <Button
            type="submit"
            loading={submitting}
            disabled={uploading || !online || provinces.isPending || provinces.isError}
            className="min-w-[112px]"
          >
            {mode === "create" ? "Đăng bán" : "Lưu thay đổi"}
          </Button>
        </div>
      </form>

      {/* Action buttons for existing product */}
      {mode === "edit" && existingProduct && "allowed_actions" in existingProduct && (() => {
        const allowed = (existingProduct as OwnProduct).allowed_actions;
        return (
          <div className="bg-white rounded-xl border border-neutral-200 p-4 space-y-3">
            <h3 className="font-medium">Thao tác với tin đăng</h3>
            <div className="flex flex-wrap gap-2">
              {allowed.includes("edit") && (
                <Button variant="secondary" onClick={() => {}} disabled>
                  Đang chỉnh sửa
                </Button>
              )}
              {allowed.includes("submit") && (
                <Button variant="secondary" onClick={() => handleAction("submit")} disabled={submitAction.isPending}>
                  Gửi duyệt
                </Button>
              )}
              {allowed.includes("hide") && (
                <Button variant="ghost" onClick={() => handleAction("hide")} disabled={hideAction.isPending} className="border-warning text-warning">
                  Ẩn tin
                </Button>
              )}
              {allowed.includes("delete") && (
                <Button variant="ghost" onClick={() => handleAction("delete")} disabled={deleteAction.isPending} className="text-danger border-danger">
                  Xóa
                </Button>
              )}
              {allowed.includes("view") && (
                <Button variant="secondary" onClick={() => navigate(`/products/${id}`)}>
                  Xem tin
                </Button>
              )}
            </div>
            <p className="text-sm text-neutral-500">
              Trạng thái: <span className="font-medium">{existingProduct.status}</span>
              {existingProduct.is_blocked && " • Đang bị hạn chế"}
              {existingProduct.is_hidden && " • Đã ẩn"}
            </p>
          </div>
        );
      })()}
    </div>
  );
}
