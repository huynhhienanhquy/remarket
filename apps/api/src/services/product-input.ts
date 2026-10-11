import type { Condition, DeliveryMethod } from "@remarket/shared";
import { PRODUCT_LIMITS, normalizeVndInput, validateCondition, validateDeliveryMethod, validateDescription, validatePriceInput, validateProductTitle, validateShippingFeeFor, validateUsageMonths } from "@remarket/shared";
import { z } from "zod";
import { validationError } from "../shared/errors.js";
import { isKnownProvinceCode } from "../shared/geography.js";
import { loadCategoryChain } from "../shared/viewer.js";

export function assertEnumValue<T extends string>(
  value: string,
  allowed: readonly T[],
  field: string,
  message: string,
): T {
  if (!allowed.includes(value as T)) {
    throw validationError(message, { [field]: message });
  }
  return value as T;
}

export const imageSchema = z
  .object({
    url: z.string({ required_error: "Ảnh không hợp lệ.", invalid_type_error: "Ảnh không hợp lệ." }),
    sort_order: z.number({
      required_error: "Thứ tự ảnh là bắt buộc.",
      invalid_type_error: "Thứ tự ảnh phải là số.",
    }),
    storage_path: z.string().optional(),
  })
  .strict();

export const productFields = z.object({
  title: z.string({ required_error: "Tên món đồ là bắt buộc.", invalid_type_error: "Tên món đồ không hợp lệ." }),
  description: z.string({
    required_error: "Mô tả là bắt buộc.",
    invalid_type_error: "Mô tả không hợp lệ.",
  }),
  category_id: z.string({ required_error: "Hãy chọn danh mục.", invalid_type_error: "Danh mục không hợp lệ." }),
  price: z.string({ required_error: "Giá không được để trống.", invalid_type_error: "Giá không hợp lệ." }),
  condition: z.string({
    required_error: "Hãy chọn tình trạng món đồ.",
    invalid_type_error: "Tình trạng món đồ không hợp lệ.",
  }),
  usage_months: z
    .number({ invalid_type_error: "Số tháng sử dụng không hợp lệ." })
    .nullable()
    .optional(),
  province_code: z.string({
    required_error: "Hãy chọn khu vực.",
    invalid_type_error: "Khu vực không hợp lệ.",
  }),
  delivery_method: z.string({
    required_error: "Hãy chọn hình thức giao nhận.",
    invalid_type_error: "Hình thức giao nhận không hợp lệ.",
  }),
  shipping_fee: z.string({
    required_error: "Phí giao hàng không được để trống.",
    invalid_type_error: "Phí giao hàng không hợp lệ.",
  }),
});

export const imagesField = z.array(imageSchema);

export const createSchema = productFields.extend({ images: imagesField }).strict();

export const patchSchema = productFields
  .extend({
    images: imagesField.optional(),
    expected_version: z
      .number({
        required_error: "Thiếu phiên bản tin đăng.",
        invalid_type_error: "Phiên bản tin đăng không hợp lệ.",
      })
      .int("Phiên bản tin đăng phải là số nguyên."),
  })
  .strict();

export type ImagePayload = z.infer<typeof imageSchema>;

export type ProductFields = z.infer<typeof productFields>;

export type CreatePayload = z.infer<typeof createSchema>;

export type PatchPayload = z.infer<typeof patchSchema>;

export interface NormalizedProduct {
  title: string;
  description: string;
  categoryId: string;
  price: string;
  condition: Condition;
  usageMonths: number | null;
  provinceCode: string;
  deliveryMethod: DeliveryMethod;
  shippingFee: string;
  images: { url: string; storagePath: string; sortOrder: number }[];
}

/** 1-8 images, contiguous `sort_order` from 0, every URL present. */
export function assertImages(images: readonly ImagePayload[]): void {
  if (images.length < 1 || images.length > PRODUCT_LIMITS.imagesMax) {
    throw validationError("Số lượng ảnh không hợp lệ.", {
      images: `Cần từ 1 đến ${PRODUCT_LIMITS.imagesMax} ảnh.`,
    });
  }
  images.forEach((image, index) => {
    if (image.sort_order !== index) {
      throw validationError("Thứ tự ảnh không hợp lệ.", { images: "sort_order phải liên tục từ 0." });
    }
    if (image.url.trim() === "") {
      throw validationError("Ảnh chưa được tải lên.", { images: `Ảnh ${index + 1} chưa tải xong.` });
    }
    if (!image.storage_path?.trim()) {
      throw validationError("Ảnh chưa được tải lên.", {
        images: `Ảnh ${index + 1} thiếu đường dẫn lưu trữ hợp lệ.`,
      });
    }
  });
}

/**
 * Collects every field error first (one `VALIDATION_ERROR` with all messages),
 * then normalizes the payload for the database.
 */
export async function validateAndNormalize(
  fields: ProductFields,
  images: readonly ImagePayload[] | undefined,
): Promise<NormalizedProduct> {
  const errors: Record<string, string> = {};

  const titleError = validateProductTitle(fields.title);
  if (titleError) errors.title = titleError;
  const descriptionError = validateDescription(fields.description);
  if (descriptionError) errors.description = descriptionError;
  const priceError = validatePriceInput(fields.price);
  if (priceError) errors.price = priceError;

  const usageError = validateUsageMonths(
    fields.usage_months === undefined || fields.usage_months === null
      ? ""
      : String(fields.usage_months),
  );
  if (usageError) errors.usage_months = usageError;

  const conditionError = validateCondition(fields.condition);
  if (conditionError) errors.condition = conditionError;

  const deliveryError = validateDeliveryMethod(fields.delivery_method);
  if (deliveryError) {
    errors.delivery_method = deliveryError;
  } else if (fields.delivery_method === "MEETUP") {
    // Gặp trực tiếp: phí giao hàng bắt buộc bằng 0 (detail-project 7.2).
    if (normalizeVndInput(fields.shipping_fee) !== "0") {
      errors.shipping_fee = "Gặp trực tiếp thì phí giao hàng phải bằng 0.";
    }
  } else {
    const shippingError = validateShippingFeeFor(
      fields.shipping_fee,
      fields.delivery_method as DeliveryMethod,
    );
    if (shippingError) errors.shipping_fee = shippingError;
  }

  const provinceCode = fields.province_code.trim();
  if (provinceCode === "") {
    errors.province_code = "Hãy chọn khu vực.";
  } else if (!isKnownProvinceCode(provinceCode)) {
    errors.province_code = "Tỉnh/thành phố không hợp lệ.";
  }

  const chain = await loadCategoryChain(fields.category_id);
  if (!chain.exists) {
    errors.category_id = "Danh mục không tồn tại.";
  } else if (!chain.isLeaf || !chain.active) {
    errors.category_id = "Chỉ chọn danh mục cấp cuối còn hoạt động.";
  }

  if (Object.keys(errors).length > 0) {
    throw validationError("Thông tin món đồ chưa hợp lệ.", errors);
  }

  if (images) assertImages(images);

  // `validateCondition` / `validateDeliveryMethod` above already rejected every
  // value outside these unions; the casts only narrow for the compiler.
  const priceDigits = normalizeVndInput(fields.price);
  const shippingFee = normalizeVndInput(fields.shipping_fee);

  return {
    title: fields.title.trim(),
    description: fields.description.trim(),
    categoryId: fields.category_id,
    price: priceDigits ?? "0",
    condition: fields.condition as Condition,
    usageMonths: fields.usage_months ?? null,
    provinceCode,
    deliveryMethod: fields.delivery_method as DeliveryMethod,
    shippingFee: fields.delivery_method === "MEETUP" ? "0" : shippingFee ?? "0",
    images: (images ?? []).map((image) => ({
      url: `/api/v1/uploads/${image.storage_path!.trim().split("/").at(-1)}`,
      storagePath: image.storage_path!.trim(),
      sortOrder: image.sort_order,
    })),
  };
}

export const searchQuerySchema = z
  .object({
    q: z
      .string({ invalid_type_error: "Từ khóa không hợp lệ." })
      .max(100, "Từ khóa tối đa 100 ký tự.")
      .optional(),
    category_id: z.string({ invalid_type_error: "Danh mục không hợp lệ." }).optional(),
    min_price: z.string({ invalid_type_error: "Giá từ không hợp lệ." }).optional(),
    max_price: z.string({ invalid_type_error: "Giá đến không hợp lệ." }).optional(),
    condition: z.string({ invalid_type_error: "Tình trạng món đồ không hợp lệ." }).optional(),
    province_code: z.string({ invalid_type_error: "Khu vực không hợp lệ." }).optional(),
    delivery_method: z.string({ invalid_type_error: "Hình thức giao nhận không hợp lệ." }).optional(),
    sort: z.string({ invalid_type_error: "Sắp xếp không hợp lệ." }).optional(),
    page: z.unknown().optional(),
    page_size: z.unknown().optional(),
  })
  .strict();

export const ownListQuerySchema = z
  .object({
    status: z.string({ invalid_type_error: "Trạng thái tin đăng không hợp lệ." }).optional(),
    page: z.unknown().optional(),
    page_size: z.unknown().optional(),
  })
  .strict();
