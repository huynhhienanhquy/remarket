import { commerceEndpoints } from "@remarket/api-client";
import { http } from "@/services/http";
export const { favorites, cart, checkout, orders, reviews } = commerceEndpoints(http);
