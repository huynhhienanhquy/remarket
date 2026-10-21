import * as SecureStore from "expo-secure-store";
import {
  createTransport,
  NativeSession,
  catalogEndpoints,
  commerceEndpoints,
  communicationEndpoints,
  adminEndpoints,
} from "@remarket/api-client";

export const API_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://localhost:3000/api/v1";
export const SOCKET_URL =
  process.env.EXPO_PUBLIC_SOCKET_URL ?? new URL(API_URL).origin;
export const http = createTransport({
  baseUrl: API_URL,
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
};
