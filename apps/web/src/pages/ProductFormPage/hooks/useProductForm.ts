import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Condition, DeliveryMethod } from "@remarket/shared";
import type { ProductAction, ProductDetail, ProductImage } from "@remarket/shared";
import type { ProductInput } from "@/types/api";
import { api } from "@/services/api";
import { queryKeys } from "@/config/queryClient";
import { apiFieldErrors } from "@/helpers/errors";
import { useToast } from "@/components/common";
import { CONDITIONS, DELIVERY_METHODS } from "@remarket/shared";
import { useConnectivity } from "@/hooks/useConnectivity";

type Mode = "create" | "edit";

interface ProductImageInput {
  url: string;
  storage_path: string;
  sort_order: number;
}

interface ProductFormData extends Omit<ProductInput, "images"> {
  images: ProductImageInput[];
}

/**
 * Owns product-form drafts, validation, uploads and mutations without changing their order.
 * Called once by the route component; hook order and handlers match the original page.
 */
export function useProductForm() {
  const { id } = useParams<{ id: string }>();
  const mode: Mode = id ? "edit" : "create";
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const online = useConnectivity();

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
  const [uploading, setUploading] = useState(false);
  const [existingProduct, setExistingProduct] = useState<ProductDetail | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);

  // Load categories for select
  const categoryQuery = useQuery({
    queryKey: queryKeys.categories,
    queryFn: () => api.categories.tree(),
  });
  const categories = categoryQuery.data;
  const provinces = useQuery({ queryKey: queryKeys.provinces, queryFn: () => api.categories.provinces() });

  // Flatten categories for select (leaf only)
  const flatCategories = categories?.flatMap((root) =>
    root.children?.length
      ? root.children.map((child) => ({ ...child, parentName: root.name }))
      : [{ ...root, parentName: "" }],
  ) ?? [];

  // Load existing product when editing
  useEffect(() => {
    let active = true;
    if (mode === "edit" && id) {
      setExistingProduct(null); setLoadError(null);
      api.products.detail(id).then((product) => { if (active) setExistingProduct(product); }).catch((error: unknown) => { if (active) setLoadError(error); });
    }
    return () => { active = false; };
  }, [mode, id]);

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
      queryClient.invalidateQueries({ queryKey: ["products"] });
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
      queryClient.invalidateQueries({ queryKey: ["products"] });
      navigate("/account/products");
    },
  });

  const hideAction = useMutation({
    mutationFn: (productId: string) => api.products.hide(productId),
    onSuccess: () => {
      toast.success("Đã ẩn tin đăng.");
      queryClient.invalidateQueries({ queryKey: ["products"] });
      navigate("/account/products");
    },
  });

  const deleteAction = useMutation({
    mutationFn: (productId: string) => api.products.remove(productId),
    onSuccess: () => {
      toast.success("Đã xóa tin đăng.");
      queryClient.invalidateQueries({ queryKey: ["products"] });
      navigate("/account/products");
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || uploading || !online) return;
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
    if (!id || !online || submitting || uploading) return;
    try {
    if (action === "submit") await submitAction.mutateAsync(id);
    else if (action === "hide") await hideAction.mutateAsync(id);
    else if (action === "delete") {
      if (window.confirm("Xóa tin đăng này? Lịch sử giao dịch vẫn được giữ.")) await deleteAction.mutateAsync(id);
    } else if (action === "edit") {
      // Already in edit mode
    }
    } catch (error) { toast.error(error instanceof Error ? error.message : "Không thể xử lý tin đăng."); }
  };
  return {
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
  };
}
