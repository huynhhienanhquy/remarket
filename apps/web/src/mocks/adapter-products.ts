import type { Condition, DeliveryMethod, ProductAction, ProductQuery } from "@remarket/shared";
import {
  PRODUCT_LIMITS,
  validateDescription,
  validateProductTitle,
  validateUsageMonths,
} from "@remarket/shared";
import type { CartApi, FavoritesApi, ProductInput, ProductsApi } from "../lib/api/contract";
import { currentViewer } from "./adapter-auth";
import { db } from "./store";
import {
  categoryWithChildren,
  conflict,
  findProduct,
  isCategoryValid,
  isPubliclyVisible,
  mustFindProduct,
  notFound,
  paginate,
  parsePaging,
  projectDetail,
  projectListItem,
  requireActive,
  requireAuth,
  requireVerified,
  sellerSummary,
  validationError,
} from "./adapter-helpers";
import type { Database, MockProduct, MockUser } from "./types";

function normalize(value: string): string {
  return value.toLocaleLowerCase("vi").replace(/\s+/g, " ").trim();
}

function matchesQuery(product: MockProduct, database: Database, keyword: string): boolean {
  const needle = normalize(keyword);
  if (needle === "") return true;
  const categoryNames = categoryWithChildren(database, product.category_id)
    .map((id) => database.categories.find((entry) => entry.id === id)?.name ?? "")
    .join(" ");
  return (
    normalize(product.title).includes(needle) ||
    normalize(product.description).includes(needle) ||
    normalize(categoryNames).includes(needle)
  );
}

function matchesDelivery(method: DeliveryMethod, filter: DeliveryMethod): boolean {
  if (filter === "BOTH") return method === "BOTH";
  // A filter for one method must also match listings offering both.
  return method === filter || method === "BOTH";
}

function sortedProducts(rows: MockProduct[], sort: ProductQuery["sort"]): MockProduct[] {
  const copy = [...rows];
  const byId = (a: MockProduct, b: MockProduct) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  switch (sort) {
    case "price_asc":
      return copy.sort((a, b) => {
        const diff = BigInt(a.price) - BigInt(b.price);
        return diff === 0n ? byId(a, b) : diff < 0n ? -1 : 1;
      });
    case "price_desc":
      return copy.sort((a, b) => {
        const diff = BigInt(a.price) - BigInt(b.price);
        return diff === 0n ? byId(a, b) : diff > 0n ? -1 : 1;
      });
    case "newest":
    default:
      return copy.sort((a, b) => {
        const left = new Date(a.published_at ?? a.created_at).getTime();
        const right = new Date(b.published_at ?? b.created_at).getTime();
        if (left === right) return byId(b, a);
        return right - left;
      });
  }
}

/** Owner-only action list (ui-spec 13 table). */
export function ownProductActions(product: MockProduct): ProductAction[] {
  if (product.is_blocked) return ["view"];
  if (product.status === "RESERVED" || product.status === "SOLD") return ["view"];
  const actions: ProductAction[] = ["view", "edit", "hide", "delete"];
  if (product.status === "REJECTED" || product.status === "INACTIVE") actions.push("submit");
  return actions;
}

function assertImages(images: ProductInput["images"]): void {
  if (images.length < 1 || images.length > PRODUCT_LIMITS.imagesMax) {
    validationError("Số lượng ảnh không hợp lệ.", {
      images: `Cần từ 1 đến ${PRODUCT_LIMITS.imagesMax} ảnh.`,
    });
  }
  images.forEach((image, index) => {
    if (image.sort_order !== index) {
      validationError("Thứ tự ảnh không hợp lệ.", { images: "sort_order phải liên tục từ 0." });
    }
    if (!image.url) {
      validationError("Ảnh chưa được tải lên.", { images: `Ảnh ${index + 1} chưa tải xong.` });
    }
  });
}

function validateProductInput(input: ProductInput): void {
  const errors: Record<string, string> = {};
  const titleError = validateProductTitle(input.title);
  if (titleError) errors.title = titleError;
  const descriptionError = validateDescription(input.description);
  if (descriptionError) errors.description = descriptionError;

  const database = db();
  const category = database.categories.find((entry) => entry.id === input.category_id);
  if (!category) errors.category_id = "Danh mục không tồn tại.";
  else if (!isCategoryValid(database, input.category_id)) {
    errors.category_id = "Chỉ chọn danh mục cấp cuối còn hoạt động.";
  }

  if (!/^\d+$/.test(input.price) || input.price === "0") {
    errors.price = "Giá phải là số nguyên dương.";
  } else if (BigInt(input.price) > 1_000_000_000n) {
    errors.price = "Giá tối đa 1.000.000.000 ₫.";
  }

  const usageError = validateUsageMonths(String(input.usage_months ?? ""));
  if (usageError) errors.usage_months = usageError;

  if (!["COD", "MEETUP", "BOTH"].includes(input.delivery_method)) {
    errors.delivery_method = "Hãy chọn hình thức giao nhận.";
  }
  if (input.delivery_method === "MEETUP" && input.shipping_fee !== "0") {
    errors.shipping_fee = "Gặp trực tiếp thì phí giao hàng phải bằng 0.";
  }
  if (!/^\d+$/.test(input.shipping_fee)) {
    errors.shipping_fee = "Phí giao hàng phải là số nguyên không âm.";
  } else if (BigInt(input.shipping_fee) > 10_000_000n) {
    errors.shipping_fee = "Phí giao hàng tối đa 10.000.000 ₫.";
  }
  if (!input.province_code) errors.province_code = "Hãy chọn khu vực.";

  if (Object.keys(errors).length > 0) {
    validationError("Thông tin món đồ chưa hợp lệ.", errors);
  }
}

export const productsApi: ProductsApi = {
  async list(query) {
    const viewer = currentViewer();
    const database = db();
    const paging = parsePaging({ page: query.page, page_size: query.page_size });

    let rows = database.products.filter((entry) => isPubliclyVisible(database, entry));
    rows = rows.filter((entry) => matchesQuery(entry, database, query.q ?? ""));

    if (query.category_id) {
      const allowed = categoryWithChildren(database, query.category_id);
      rows = rows.filter((entry) => allowed.includes(entry.category_id));
    }
    if (query.condition) {
      rows = rows.filter((entry) => entry.condition === (query.condition as Condition));
    }
    if (query.province_code) {
      rows = rows.filter((entry) => entry.province_code === query.province_code);
    }
    if (query.delivery_method) {
      rows = rows.filter((entry) => matchesDelivery(entry.delivery_method, query.delivery_method!));
    }
    if (query.min_price) {
      rows = rows.filter((entry) => BigInt(entry.price) >= BigInt(query.min_price!));
    }
    if (query.max_price) {
      rows = rows.filter((entry) => BigInt(entry.price) <= BigInt(query.max_price!));
    }

    const sorted = sortedProducts(rows, query.sort ?? "newest");
    const { slice, meta } = paginate(sorted, paging);
    return {
      items: slice.map((entry) => projectListItem(database, entry, viewer)),
      meta,
    };
  },

  async detail(id) {
    const viewer = currentViewer();
    const database = db();
    const product = findProduct(database, id);
    if (!product) notFound("Không tìm thấy tin đăng này.");

    const isOwner = viewer !== null && viewer.id === product.seller_id;
    const isAdmin = viewer?.role === "ADMIN";
    if (product.is_blocked) {
      if (!isOwner && !isAdmin) notFound("Tin đăng không còn khả dụng.");
    } else if (!isOwner && !isAdmin && !["ACTIVE", "RESERVED", "SOLD"].includes(product.status)) {
      notFound("Tin đăng không còn khả dụng.");
    }
    return projectDetail(database, product, viewer);
  },

  async mine(query) {
    const viewer = requireActive(currentViewer());
    const database = db();
    const paging = parsePaging({ page: query.page, page_size: 10 });

    let rows = database.products.filter((entry) => entry.seller_id === viewer.id);
    if (query.status) rows = rows.filter((entry) => entry.status === query.status);
    rows = [...rows].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

    const { slice, meta } = paginate(rows, paging);
    return {
      items: slice.map((entry) => ({
        ...projectDetail(database, entry, viewer),
        allowed_actions: ownProductActions(entry),
      })),
      meta,
    };
  },

  async create(input) {
    const viewer = requireVerified(currentViewer());
    validateProductInput(input);
    assertImages(input.images);

    const database = db();
    const now = new Date().toISOString();
    const newId = `00000003-0000-4000-8000-${(database.products.length + 200).toString(16).padStart(12, "0")}`;
    const product: MockProduct = {
      id: newId,
      seller_id: viewer.id,
      category_id: input.category_id,
      title: input.title.trim(),
      description: input.description.trim(),
      price: input.price,
      condition: input.condition,
      usage_months: input.usage_months,
      province_code: input.province_code,
      delivery_method: input.delivery_method,
      shipping_fee: input.delivery_method === "MEETUP" ? "0" : input.shipping_fee,
      status: "PENDING",
      version: 1,
      is_blocked: false,
      block_reason: null,
      rejection_reason: null,
      reserved_order_id: null,
      published_at: null,
      deleted_at: null,
      created_at: now,
      updated_at: now,
      images: input.images.map((image, index) => ({
        id: `${newId}-img-${index}`,
        url: image.url,
        sort_order: index,
      })),
    };
    database.products.push(product);
    return projectDetail(database, product, viewer);
  },

  async update(id, input, expectedVersion) {
    const viewer = requireVerified(currentViewer());
    const database = db();
    const product = findProduct(database, id);
    if (!product || product.seller_id !== viewer.id) notFound("Không tìm thấy tin đăng này.");
    if (product.status === "RESERVED" || product.status === "SOLD") {
      conflict("VERSION_CONFLICT", "Tin đang được giữ hoặc đã bán nên không thể chỉnh sửa.");
    }
    if (product.is_blocked) {
      conflict("FORBIDDEN", "Tin đang bị hạn chế, chưa thể chỉnh sửa.");
    }
    if (product.version !== expectedVersion) {
      conflict("VERSION_CONFLICT", "Tin đăng đã thay đổi. Vui lòng tải lại để xem thông tin mới nhất.");
    }

    validateProductInput(input);
    assertImages(input.images);

    product.category_id = input.category_id;
    product.title = input.title.trim();
    product.description = input.description.trim();
    product.price = input.price;
    product.condition = input.condition;
    product.usage_months = input.usage_months;
    product.province_code = input.province_code;
    product.delivery_method = input.delivery_method;
    product.shipping_fee = input.delivery_method === "MEETUP" ? "0" : input.shipping_fee;
    product.images = input.images.map((image, index) => ({
      id: `${product.id}-img-${index}`,
      url: image.url,
      sort_order: index,
    }));
    product.version += 1;
    product.updated_at = new Date().toISOString();
    // Editing an ACTIVE listing sends it back to moderation (6.3).
    if (product.status === "ACTIVE") {
      product.status = "PENDING";
      product.published_at = null;
    } else if (product.status === "PENDING") {
      product.rejection_reason = null;
    }
    return projectDetail(database, product, viewer);
  },

  async submit(id) {
    const viewer = requireVerified(currentViewer());
    const database = db();
    const product = findProduct(database, id);
    if (!product || product.seller_id !== viewer.id) notFound("Không tìm thấy tin đăng này.");
    if (product.is_blocked) conflict("FORBIDDEN", "Tin đang bị hạn chế nên chưa thể gửi duyệt.");
    if (!["REJECTED", "INACTIVE"].includes(product.status)) {
      conflict("INVALID_ORDER_TRANSITION", "Tin này không ở trạng thái gửi duyệt lại.");
    }
    product.status = "PENDING";
    product.rejection_reason = null;
    product.version += 1;
    product.updated_at = new Date().toISOString();
    return projectDetail(database, product, viewer);
  },

  async hide(id) {
    const viewer = requireVerified(currentViewer());
    const database = db();
    const product = findProduct(database, id);
    if (!product || product.seller_id !== viewer.id) notFound("Không tìm thấy tin đăng này.");
    if (product.status === "RESERVED" || product.status === "SOLD") {
      conflict("INVALID_ORDER_TRANSITION", "Không thể ẩn tin đang được giữ hoặc đã bán.");
    }
    product.status = "INACTIVE";
    product.version += 1;
    product.updated_at = new Date().toISOString();
    return projectDetail(database, product, viewer);
  },

  async remove(id) {
    const viewer = requireVerified(currentViewer());
    const database = db();
    const product = findProduct(database, id);
    if (!product || product.seller_id !== viewer.id) notFound("Không tìm thấy tin đăng này.");
    if (product.status === "RESERVED" || product.status === "SOLD") {
      conflict("INVALID_ORDER_TRANSITION", "Không thể xóa tin đang được giữ hoặc đã bán.");
    }
    // Soft delete keeps history intact (6.3).
    product.deleted_at = new Date().toISOString();
    product.status = "INACTIVE";
    product.version += 1;
    product.updated_at = new Date().toISOString();
    return { id: product.id };
  },
};

/* ------------------------------------------------------------------ *
 * Favorites
 * ------------------------------------------------------------------ */

export const favoritesApi: FavoritesApi = {
  async list(page) {
    const viewer = requireAuth(currentViewer());
    const database = db();
    const paging = parsePaging({ page, page_size: 20 });
    const rows = database.favorites
      .filter((favorite) => favorite.user_id === viewer.id)
      .map((favorite) => findProduct(database, favorite.product_id))
      .filter((product): product is MockProduct => product !== undefined)
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

    const { slice, meta } = paginate(rows, paging);
    return {
      items: slice.map((entry) => projectListItem(database, entry, viewer)),
      meta,
    };
  },

  async set(productId, on) {
    const viewer = requireAuth(currentViewer());
    const database = db();
    const product = mustFindProduct(database, productId);
    if (product.seller_id === viewer.id) {
      validationError("Bạn không thể lưu tin đăng của chính mình.");
    }
    const existing = database.favorites.find(
      (favorite) => favorite.user_id === viewer.id && favorite.product_id === productId,
    );
    if (on && !existing) {
      database.favorites.push({
        user_id: viewer.id,
        product_id: productId,
        created_at: new Date().toISOString(),
      });
    }
    if (!on && existing) {
      database.favorites = database.favorites.filter(
        (favorite) => !(favorite.user_id === viewer.id && favorite.product_id === productId),
      );
    }
    return { is_favorited: on };
  },
};

/* ------------------------------------------------------------------ *
 * Cart
 * ------------------------------------------------------------------ */

function cartReason(database: Database, product: MockProduct, viewer: MockUser): string | null {
  if (product.deleted_at !== null || product.is_blocked) return "Tin đăng không còn khả dụng.";
  if (product.seller_id === viewer.id) return "Không thể mua món đồ của chính mình.";
  if (product.status !== "ACTIVE") {
    if (product.status === "RESERVED") return "Sản phẩm đang được giữ cho một giao dịch.";
    if (product.status === "SOLD") return "Sản phẩm đã bán.";
    return "Tin đăng không khả dụng để mua.";
  }
  const seller = database.users.find((entry) => entry.id === product.seller_id);
  if (!seller || seller.status !== "ACTIVE" || seller.email_verified_at === null) {
    return "Người bán chưa đủ điều kiện giao dịch.";
  }
  if (!isCategoryValid(database, product.category_id)) {
    return "Danh mục sản phẩm không còn hoạt động.";
  }
  return null;
}

export const cartApi: CartApi = {
  async get() {
    const viewer = requireActive(currentViewer());
    const database = db();
    const rows = database.cart_items
      .filter((item) => item.user_id === viewer.id)
      .map((item) => {
        const product = findProduct(database, item.product_id);
        if (!product) return null;
        const reason = cartReason(database, product, viewer);
        const addedPrice = item.added_price ?? product.price;
        return {
          product_id: product.id,
          title: product.title,
          price: product.price,
          added_price: addedPrice,
          image_url: product.images[0]?.url ?? null,
          condition: product.condition,
          status: product.status,
          province_label: projectListItem(database, product, viewer).province_label,
          available: reason === null,
          unavailable_reason: reason,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);

    const groups = new Map<string, typeof rows>();
    for (const row of rows) {
      const product = findProduct(database, row.product_id)!;
      const bucket = groups.get(product.seller_id) ?? [];
      bucket.push(row);
      groups.set(product.seller_id, bucket);
    }

    return {
      groups: [...groups.entries()].map(([sellerId, items]) => ({
        seller: sellerSummary(database, sellerId),
        items,
      })),
      total_items: rows.length,
    };
  },

  async add(productId) {
    const viewer = requireVerified(currentViewer());
    const database = db();
    const product = mustFindProduct(database, productId);
    const reason = cartReason(database, product, viewer);
    if (reason !== null) validationError(reason);
    const exists = database.cart_items.some(
      (item) => item.user_id === viewer.id && item.product_id === productId,
    );
    if (!exists) {
      database.cart_items.push({
        user_id: viewer.id,
        product_id: productId,
        created_at: new Date().toISOString(),
        added_price: product.price,
      });
    }
    return cartApi.get();
  },

  async remove(productId) {
    const viewer = requireActive(currentViewer());
    const database = db();
    database.cart_items = database.cart_items.filter(
      (item) => !(item.user_id === viewer.id && item.product_id === productId),
    );
    return cartApi.get();
  },
};

export { requireVerified };
