import { adminEndpoints } from "@remarket/api-client";
import { http } from "@/services/http";

export const admin = adminEndpoints(http);
