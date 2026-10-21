import { communicationEndpoints } from "@remarket/api-client";
import { http } from "@/services/http";
export const { chat, reports, notifications, support } = communicationEndpoints(http);
