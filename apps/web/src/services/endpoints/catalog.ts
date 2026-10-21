import { catalogEndpoints } from "@remarket/api-client";
import { http } from "@/services/http";
export const { categories, products, uploads, profiles } = catalogEndpoints(http);
