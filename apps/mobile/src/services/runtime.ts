import * as SecureStore from "expo-secure-store";
import {
  createTransport,
  NativeSession,
  catalogEndpoints,
  commerceEndpoints,
  communicationEndpoints,
  adminEndpoints,
  aiEndpoints,
} from "@remarket/api-client";

export const API_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://localhost:3000/api/v1";
const apiAddress = new URL(API_URL);
export const SOCKET_URL =
  process.env.EXPO_PUBLIC_SOCKET_URL ?? apiAddress.origin;
export const http = createTransport({
  baseUrl: API_URL,
  // Render Free can take about a minute to wake before serving requests.
  timeoutMs(method, path) {
    if (
      apiAddress.hostname.endsWith(".onrender.com") &&
      (method === "GET" ||
        path === "/auth/mobile/bootstrap" ||
        path === "/auth/mobile/refresh")
    ) {
      return 75_000;
    }
  },
  getToken: () => nativeSession?.getToken() ?? null,
  getGeneration: () => nativeSession?.getGeneration() ?? 0,
  refresh: () => nativeSession.refresh(),
  onExpired: () => nativeSession.expire(),
  onForbidden: () => nativeSession.updateIdentity(),
});
const nativeSession = new NativeSession(http, {
  read: () => SecureStore.getItemAsync("remarket.refresh.v1"),
  write: (token) => SecureStore.setItemAsync("remarket.refresh.v1", token),
  clear: () => SecureStore.deleteItemAsync("remarket.refresh.v1"),
});
export const session = nativeSession;
export const api = {
  ...catalogEndpoints(http),
  ...commerceEndpoints(http),
  ...communicationEndpoints(http),
  admin: adminEndpoints(http),
  ai: aiEndpoints(http),
};
