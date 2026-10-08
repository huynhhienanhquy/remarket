import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Condition, DeliveryMethod } from "@remarket/shared";
import type { OwnProduct, ProductAction, ProductDetail, ProductImage } from "@remarket/shared";
import type { ProductInput } from "../../lib/api/contract";
import { api } from "../../lib/api";
import { queryKeys } from "../../lib/queryClient";
import { apiFieldErrors } from "../../lib/errors";
import {
  Button,
  Input,
  Select,
  Textarea,
  ImageUpload,
  FormRow,
  Skeleton,
  Spinner,
} from "../../components/ui";
import { CONDITIONS, DELIVERY_METHODS, conditionLabel, deliveryLabel } from "@remarket/shared";
import { toast } from "react-toastify";

type Mode = "create" | "edit";

interface ProductImageInput {
  url: string;
  storage_path: string;
  sort_order: number;
}

interface ProductFormData extends Omit<ProductInput, "images"> {
  images: ProductImageInput[];
}

export function ProductFormPage() {
  const { id } = useParams<{ id: string }>();
  const mode: Mode = id ? "edit" : "create";
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [form, setForm] = useState<ProductFormData>({
    title: "",
    description: "",
    price: "",
    condition: "GOOD" as Condition,
    usage_months: null,
    category_id: "",
    province_code: "",
    delivery_method: "BOTH" as DeliveryMethod,
    shipping_fee: "0",
    images: [],
  });
  const [errors, setErrors] = useState<Partial<Record<keyof ProductInput, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [existingProduct, setExistingProduct] = useState<ProductDetail | null>(null);

  // Load categories for select
  const { data: categories } = useQuery({
    queryKey: queryKeys.categories,
    queryFn: () => api.categories.tree(),
  });

  // Flatten categories for select (leaf only)
  const flatCategories = categories?.flatMap((root) =>
    root.children?.length
      ? root.children.map((child) => ({ ...child, parentName: root.name }))
      : [{ ...root, parentName: "" }],
  ) ?? [];

  // Load existing product when editing
  useEffect(() => {
    if (mode === "edit" && id) {
      api.products.detail(id).then(setExistingProduct).catch(() => navigate("/account/products"));
    }
  }, [mode, id, navigate]);

  // Initialize form with existing data
  useEffect(() => {
    if (existingProduct) {
      setForm({
        title: existingProduct.title,
        description: existingProduct.description,
        price: existingProduct.price,
        condition: existingProduct.condition,
        usage_months: existingProduct.usage_months,
        category_id: existingProduct.category_id,
        province_code: existingProduct.province_code,
        delivery_method: existingProduct.delivery_method,
        shipping_fee: existingProduct.shipping_fee,
        images: existingProduct.images.map((img: ProductImage) => ({
          url: img.url,
          storage_path: img.storage_path ?? "",
          sort_order: img.sort_order,
        })),
      });
    }
  }, [existingProduct]);

  const validate = (): boolean => {
    const newErrors: Partial<Record<keyof ProductInput, string>> = {};

    if (form.title.trim().length < 5) newErrors.title = "Tên món đồ cần ít nhất 5 ký tự.";
    if (form.title.trim().length > 150) newErrors.title = "Tên món đồ tối đa 150 ký tự.";

    if (form.description.trim().length < 20) newErrors.description = "Mô tả cần ít nhất 20 ký tự.";
    if (form.description.trim().length > 5000) newErrors.description = "Mô tả tối đa 5000 ký tự.";

    const priceValid = /^\d+$/.test(form.price) && form.price !== "0";
    if (!priceValid) newErrors.price = "Giá phải là số nguyên dương.";
    else if (BigInt(form.price) > 1_000_000_000n) newErrors.price = "Giá tối đa 1.000.000.000 ₫.";

    if (!form.category_id) newErrors.category_id = "Hãy chọn danh mục.";

    const category = flatCategories.find((c) => c.id === form.category_id);
    if (category && category.children?.length) newErrors.category_id = "Chỉ chọn danh mục cấp cuối.";

    if (!form.province_code) newErrors.province_code = "Hãy chọn tỉnh/thành phố.";

    if (!CONDITIONS.includes(form.condition)) newErrors.condition = "Hãy chọn tình trạng.";

    if (form.usage_months !== null && (form.usage_months < 0 || form.usage_months > 1200)) {
      newErrors.usage_months = "Số tháng sử dụng không hợp lệ.";
    }

    if (!DELIVERY_METHODS.includes(form.delivery_method)) newErrors.delivery_method = "Hãy chọn hình thức giao nhận.";

    const shippingValid = /^\d+$/.test(form.shipping_fee);
    if (!shippingValid) newErrors.shipping_fee = "Phí giao hàng phải là số nguyên không âm.";
    else if (BigInt(form.shipping_fee) > 10_000_000n) newErrors.shipping_fee = "Phí giao hàng tối đa 10.000.000 ₫.";
    if (form.delivery_method === "MEETUP" && form.shipping_fee !== "0") {
      newErrors.shipping_fee = "Gặp trực tiếp thì phí giao hàng phải bằng 0.";
    }

    if (form.images.length < 1) newErrors.images = "Cần ít nhất 1 ảnh.";
    if (form.images.length > 8) newErrors.images = "Tối đa 8 ảnh.";
    form.images.forEach((img, idx) => {
      if (!img.url) newErrors.images = `Ảnh ${idx + 1} chưa tải xong.`;
      if (img.sort_order !== idx) newErrors.images = "Thứ tự ảnh không hợp lệ.";
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const saveMutation = useMutation({
    mutationFn: (request: { input: ProductInput; productId?: string; expectedVersion?: number }) =>
      request.productId
        ? api.products.update(request.productId, request.input, request.expectedVersion ?? 1)
        : api.products.create(request.input),
    onSuccess: () => {
      toast.success(mode === "create" ? "Tạo tin đăng thành công. Đang chờ duyệt." : "Cập nhật tin đăng thành công.");
      queryClient.invalidateQueries({ queryKey: queryKeys.ownProducts({ status: "ALL", page: 1 }) });
      navigate("/account/products");
    },
    onError: (error: unknown) => {
      const fields = apiFieldErrors(error);
      if (fields) setErrors(fields);
      else toast.error(error instanceof Error ? error.message : "Có lỗi xảy ra.");
    },
  });

  const submitAction = useMutation({
    mutationFn: (productId: string) => api.products.submit(productId),
    onSuccess: () => {
      toast.success("Đã gửi duyệt lại.");
      queryClient.invalidateQueries({ queryKey: queryKeys.ownProducts({ status: "ALL", page: 1 }) });
      navigate("/account/products");
    },
  });

  const hideAction = useMutation({
    mutationFn: (productId: string) => api.products.hide(productId),
    onSuccess: () => {
      toast.success("Đã ẩn tin đăng.");
      queryClient.invalidateQueries({ queryKey: queryKeys.ownProducts({ status: "ALL", page: 1 }) });
      navigate("/account/products");
    },
  });

  const deleteAction = useMutation({
    mutationFn: (productId: string) => api.products.remove(productId),
    onSuccess: () => {
      toast.success("Đã xóa tin đăng.");
      queryClient.invalidateQueries({ queryKey: queryKeys.ownProducts({ status: "ALL", page: 1 }) });
      navigate("/account/products");
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    try {
      if (mode === "create") {
        await saveMutation.mutateAsync({ input: form });
      } else if (id) {
        await saveMutation.mutateAsync({
          input: form,
          productId: id,
          expectedVersion: existingProduct?.version ?? 1,
        });
      }
    } catch {
      // React Query's onError callback above owns user-facing error handling.
      // Prevent mutateAsync rejection from escaping the form event handler.
    } finally {
      setSubmitting(false);
    }
  };

  const handleAction = async (action: ProductAction) => {
    if (!id) return;
    if (action === "submit") await submitAction.mutateAsync(id);
    else if (action === "hide") await hideAction.mutateAsync(id);
    else if (action === "delete") {
      if (window.confirm("Xóa vĩnh viễn tin đăng này?")) await deleteAction.mutateAsync(id);
    } else if (action === "edit") {
      // Already in edit mode
    }
  };

  if (mode === "edit" && !existingProduct) {
    return <Skeleton className="space-y-4 h-[500px]" />;
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{mode === "create" ? "Đăng tin mới" : "Chỉnh sửa tin đăng"}</h1>
      </div>

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
                {[
                  { code: "VN-01", name: "Hà Nội" },
                  { code: "VN-29", name: "Đà Nẵng" },
                  { code: "VN-65", name: "TP. Hồ Chí Minh" },
                  { code: "VN-14", name: "Hải Phòng" },
                  { code: "VN-37", name: "Kon Tum" },
                  { code: "VN-38", name: "Gia Lai" },
                  { code: "VN-39", name: "Đắk Lắk" },
                  { code: "VN-40", name: "Đắk Nông" },
                  { code: "VN-41", name: "Lâm Đồng" },
                  { code: "VN-43", name: "Bình Phước" },
                  { code: "VN-44", name: "Tây Ninh" },
                  { code: "VN-45", name: "Bình Dương" },
                  { code: "VN-46", name: "Đồng Nai" },
                  { code: "VN-47", name: "Long An" },
                  { code: "VN-49", name: "Đồng Tháp" },
                  { code: "VN-50", name: "An Giang" },
                  { code: "VN-51", name: "Bà Rịa - Vũng Tàu" },
                  { code: "VN-52", name: "Hồ Chí Minh" },
                  { code: "VN-53", name: "Tiền Giang" },
                  { code: "VN-54", name: "Bến Tre" },
                  { code: "VN-55", name: "Trà Vinh" },
                  { code: "VN-56", name: "Vĩnh Long" },
                  { code: "VN-57", name: "Cần Thơ" },
                  { code: "VN-58", name: "Hậu Giang" },
                  { code: "VN-59", name: "Sóc Trăng" },
                  { code: "VN-60", name: "Bạc Liêu" },
                  { code: "VN-61", name: "Cà Mau" },
                ].map((p) => (
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
                  <img src={img.url} alt={`Ảnh ${idx + 1}`} className="w-full h-full object-cover" />
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
              <ImageUpload
                onUpload={(upload) => {
                  const newImages = [
                    ...form.images,
                    { ...upload, sort_order: form.images.length },
                  ];
                  setForm({ ...form, images: newImages });
                }}
                accept="image/jpeg,image/png,image/webp"
                maxSize={5 * 1024 * 1024}
              />
            )}
          </div>
          {errors.images && <p className="text-sm text-danger">{errors.images}</p>}
        </div>

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-neutral-200">
          <Button variant="secondary" onClick={() => navigate("/account/products")}>
            Hủy
          </Button>
          <Button type="submit" disabled={submitting} className="min-w-[140px]">
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
