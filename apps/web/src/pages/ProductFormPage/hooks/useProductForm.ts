import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Condition, DeliveryMethod } from "@remarket/shared";
import type { ProductAction, ProductImage } from "@remarket/shared";
import type { ProductInput } from "@/types/api";
import { api } from "@/services/api";
import { queryKeys } from "@/config/queryClient";
import { apiFieldErrors } from "@/helpers/errors";
import { useToast } from "@/components/common";
import { PRODUCT_LIMITS, validateProductTitle, validateDescription, validatePriceInput, validateUsageMonths, validateCondition, validateDeliveryMethod, validateShippingFee } from "@remarket/shared";
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
  const [deleteOpen, setDeleteOpen] = useState(false);
  const initializedId = useRef<string | null>(null);
  const productQuery = useQuery({ queryKey: queryKeys.product(id ?? ""), queryFn: () => api.products.detail(id!), enabled: mode === "edit" && !!id, staleTime: Infinity });
  const existingProduct = productQuery.data ?? null;
  const loadError = productQuery.error;

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

  // Initialize form with existing data
  useEffect(() => {
    if (existingProduct && initializedId.current !== existingProduct.id) {
      initializedId.current = existingProduct.id;
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

    const fields = {
      title: validateProductTitle(form.title), description: validateDescription(form.description),
      price: validatePriceInput(form.price), usage_months: validateUsageMonths(form.usage_months === null ? "" : String(form.usage_months)),
      condition: validateCondition(form.condition), delivery_method: validateDeliveryMethod(form.delivery_method),
      shipping_fee: validateShippingFee(form.shipping_fee, true),
    };
    for (const [key, error] of Object.entries(fields)) if (error) newErrors[key as keyof ProductInput] = error;

    if (!form.category_id) newErrors.category_id = "Hãy chọn danh mục.";

    const category = flatCategories.find((c) => c.id === form.category_id);
    if (category && category.children?.length) newErrors.category_id = "Chỉ chọn danh mục cấp cuối.";

    if (!form.province_code) newErrors.province_code = "Hãy chọn tỉnh/thành phố.";

    if (form.delivery_method === "MEETUP" && form.shipping_fee !== "0") {
      newErrors.shipping_fee = "Gặp trực tiếp thì phí giao hàng phải bằng 0.";
    }

    if (form.images.length < 1) newErrors.images = "Cần ít nhất 1 ảnh.";
    if (form.images.length > PRODUCT_LIMITS.imagesMax) newErrors.images = `Tối đa ${PRODUCT_LIMITS.imagesMax} ảnh.`;
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
      setDeleteOpen(true);
    } else if (action === "edit") {
      // Already in edit mode
    }
    } catch (error) { toast.error(error instanceof Error ? error.message : "Không thể xử lý tin đăng."); }
  };
  async function confirmDelete() {
    if (!id || !online || deleteAction.isPending) return;
    try { await deleteAction.mutateAsync(id); setDeleteOpen(false); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Không thể xóa tin đăng."); }
  }
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
    retryLoad: () => void productQuery.refetch(),
    deleteOpen,
    cancelDelete: () => setDeleteOpen(false),
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
  };
}
