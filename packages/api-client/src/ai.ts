import type { AiThread, AiThreadSummary, ProductListItem } from "@remarket/shared";
import type { HttpTransport } from "./transport.js";

export function aiEndpoints(http: HttpTransport) {
  return {
    config: () => http.get<{ enabled: boolean }>("/ai/config"),
    listThreads: () => http.get<AiThreadSummary[]>("/ai/threads"),
    createThread: () => http.post<AiThreadSummary>("/ai/threads"),
    readThread: (id: string) => http.get<AiThread>(`/ai/threads/${encodeURIComponent(id)}`),
    deleteThread: (id: string) => http.delete<{ deleted: boolean }>(`/ai/threads/${encodeURIComponent(id)}`),
    resolveProducts: (ids: string[]) => http.post<ProductListItem[]>("/ai/products/resolve", { ids }),
  };
}
