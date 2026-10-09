import { useProductForm } from "./hooks/useProductForm";
import type { Condition, DeliveryMethod } from "@remarket/shared";
import type { OwnProduct } from "@remarket/shared";
import { Button, ApiImage, Input, Select, Textarea, FormRow, Skeleton, Spinner, InlineAlert } from "../../components/common";
import { CONDITIONS, DELIVERY_METHODS, conditionLabel, deliveryLabel } from "@remarket/shared";
import { OfflineNotice, QueryFailure } from "../../components/common/PageFeedback/PageFeedback";
import { ProductImageUpload } from "./sections/ProductImageUpload";

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

  if (mode === "edit" && !existingProduct) {
    if (loadError) return <QueryFailure error={loadError} retry={() => window.location.reload()} />;
    return <Skeleton className="space-y-4 h-[500px]" />;
  }
  if (existingProduct && !existingProduct.capabilities.can_edit) return <InlineAlert tone="warning" title="Không thể chỉnh sửa tin này">Tin đang được giữ, đã bán hoặc bị hạn chế. <Button onClick={() => navigate("/account/products")}>Quay lại tin đăng</Button></InlineAlert>;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{mode === "create" ? "Đăng tin mới" : "Chỉnh sửa tin đăng"}</h1>
      </div>
      <OfflineNotice online={online} />
      {categoryQuery.isError && <QueryFailure error={categoryQuery.error} retry={() => void categoryQuery.refetch()} />}
      {provinces.isError && <QueryFailure error={provinces.error} retry={() => void provinces.refetch()} />}
      {saveMutation.isError && <QueryFailure error={saveMutation.error} />}

      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        <div className="bg-white rounded-xl border border-neutral-200 p-5 space-y-5">
          <h2 className="text-lg font-medium">Thông tin cơ bản</h2>

          <FormRow label="Tiêu đề" error={errors.title}>
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Ví dụ: MacBook Air M1 2020 8GB/256GB"
              maxLength={150}
            />
          </FormRow>

          <FormRow label="Danh mục" error={errors.category_id}>
            <Select
              value={form.category_id}
              onChange={(e) => setForm({ ...form, category_id: e.target.value })}
            >
              <option value="" disabled>Chọn danh mục</option>
              {flatCategories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.parentName ? `${cat.parentName} / ${cat.name}` : cat.name}
                </option>
              ))}
            </Select>
          </FormRow>

          <FormRow label="Tình trạng" error={errors.condition}>
            <Select
              value={form.condition}
              onChange={(e) => setForm({ ...form, condition: e.target.value as Condition })}
            >
              {CONDITIONS.map((c) => (
                <option key={c} value={c}>{conditionLabel(c)}</option>
              ))}
            </Select>
          </FormRow>

          <FormRow label="Số tháng đã dùng" error={errors.usage_months}>
            <Input
              type="number"
              min={0}
              max={1200}
              value={form.usage_months ?? ""}
              onChange={(e) => setForm({ ...form, usage_months: e.target.value ? parseInt(e.target.value) : null })}
              placeholder="Để trống nếu không xác định"
            />
          </FormRow>
        </div>

        <div className="bg-white rounded-xl border border-neutral-200 p-5 space-y-5">
          <h2 className="text-lg font-medium">Mô tả chi tiết</h2>
          <FormRow label="Mô tả" error={errors.description}>
            <Textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Mô tả chi tiết về sản phẩm, tình trạng, lý do bán..."
              rows={6}
              maxLength={5000}
            />
          </FormRow>
        </div>

        <div className="bg-white rounded-xl border border-neutral-200 p-5 space-y-5">
          <h2 className="text-lg font-medium">Giá & Giao nhận</h2>

          <FormRow label="Giá (VND)" error={errors.price}>
            <Input
              type="text"
              inputMode="numeric"
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value.replace(/[^\d]/g, "") })}
              placeholder="Ví dụ: 1500000"
            />
          </FormRow>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormRow label="Tỉnh/Thành phố" error={errors.province_code}>
              <Select
                value={form.province_code}
                onChange={(e) => setForm({ ...form, province_code: e.target.value })}
              >
                <option value="" disabled>Chọn tỉnh/thành</option>
                {provinces.data?.map((p) => (
                  <option key={p.code} value={p.code}>{p.name}</option>
                ))}
              </Select>
            </FormRow>

            <FormRow label="Cách giao nhận" error={errors.delivery_method}>
              <Select value={form.delivery_method} onChange={(e) => setForm({ ...form, delivery_method: e.target.value as DeliveryMethod })}>
                <option value="" disabled>Chọn hình thức giao nhận</option>
                {DELIVERY_METHODS.map((d) => (
                  <option key={d} value={d}>{deliveryLabel(d)}</option>
                ))}
              </Select>
            </FormRow>
          </div>

          <FormRow label="Phí ship (VND)" error={errors.shipping_fee}>
            <Input
              type="text"
              inputMode="numeric"
              value={form.shipping_fee}
              onChange={(e) => setForm({ ...form, shipping_fee: e.target.value.replace(/[^\d]/g, "") })}
              placeholder="0 nếu gặp trực tiếp"
            />
            <p className="text-sm text-neutral-500 mt-1">Gặp trực tiếp (MEETUP) thì phí phải bằng 0.</p>
          </FormRow>
        </div>

        <div className="bg-white rounded-xl border border-neutral-200 p-5 space-y-5">
          <h2 className="text-lg font-medium">Ảnh sản phẩm (1-8 ảnh)</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {form.images.map((img, idx) => (
              <div key={idx} className="relative aspect-square rounded-lg border border-neutral-200 overflow-hidden">
                {img.url ? (
                  <ApiImage src={img.url} alt={`Ảnh ${idx + 1}`} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-neutral-100 text-neutral-400 text-sm">
                    Ảnh {idx + 1}
                  </div>
                )}
                <button
                  type="button"
                  className="absolute top-1 right-1 p-1 bg-black/50 text-white rounded-full hover:bg-black/70"
                  onClick={() => {
                    const newImages = form.images.filter((_, i) => i !== idx);
                    setForm({ ...form, images: newImages.map((im, i) => ({ ...im, sort_order: i })) });
                  }}
                >
                  ✕
                </button>
                <span className="absolute bottom-1 left-1 px-1.5 py-0.5 bg-black/50 text-white text-xs rounded">
                  {idx + 1}
                </span>
              </div>
            ))}
            {form.images.length < 8 && (
              <ProductImageUpload
                disabled={submitting || !online}
                onBusyChange={setUploading}
                onUpload={(upload) => {
                  setForm((current) => ({ ...current, images: [...current.images, { ...upload, sort_order: current.images.length }].slice(0, 8) }));
                }}
              />
            )}
          </div>
          {errors.images && <p className="text-sm text-danger">{errors.images}</p>}
        </div>

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-neutral-200">
          <Button variant="secondary" onClick={() => navigate("/account/products")}>
            Hủy
          </Button>
          <Button type="submit" disabled={submitting || uploading || !online || provinces.isPending || provinces.isError} className="min-w-[140px]">
            {submitting ? <Spinner size={16} /> : mode === "create" ? "Đăng tin" : "Lưu thay đổi"}
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
