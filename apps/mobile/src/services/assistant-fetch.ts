import "./assistant-platform";
import "@copilotkit/react-native/polyfills";
import { Platform } from "react-native";
import { platformFetch } from "./assistant-platform";

// Expo already provides streaming fetch. The SDK checks the legacy Response
// constructor, so it can install its XHR shim even when Expo fetch is active.
if (Platform.OS !== "web" && !["1", "true"].includes(process.env.EXPO_PUBLIC_USE_RN_FETCH ?? "")) {
  globalThis.fetch = platformFetch;
}
