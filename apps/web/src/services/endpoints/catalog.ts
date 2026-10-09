import type { CategoriesApi, ProductInput, ProductsApi, ProfilesApi, UploadsApi } from "@/types/api";
import { http } from "@/services/http";

export const categories: CategoriesApi = {
  tree: () => http.get("/categories"),
  provinces: () => http.get("/provinces"),
};

export const products: ProductsApi = {
  list: (query) => http.get("/products", { ...query }),
  detail: (id) => http.get(`/products/${id}`),
  mine: (query) => http.get("/account/products", { ...query }),
  create: (input: ProductInput) => http.post("/products", input),
  update: (id, input, expectedVersion) =>
    http.patch(`/products/${id}`, { ...input, expected_version: expectedVersion }),
  submit: (id) => http.post(`/products/${id}/submit`),
  hide: (id) => http.post(`/products/${id}/hide`),
  remove: (id) => http.delete(`/products/${id}`),
};

export const uploads: UploadsApi = {
  upload: (file, purpose) => {
    const form = new FormData();
    form.append("file", file);
    form.append("purpose", purpose);
    return http.post("/uploads", form);
  },
};

export const profiles: ProfilesApi = {
  publicProfile: (userId) => http.get(`/users/${userId}`),
  products: (userId, page) => http.get(`/users/${userId}/products`, { page }),
};
