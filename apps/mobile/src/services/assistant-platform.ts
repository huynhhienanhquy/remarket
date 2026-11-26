import { getRandomValues } from "expo-crypto";
import { Platform } from "react-native";

// Install the RNG before CopilotKit evaluates its crypto fallback.
if (Platform.OS !== "web" && !globalThis.crypto?.getRandomValues) {
  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    value: { ...globalThis.crypto, getRandomValues },
  });
}

export const platformFetch = globalThis.fetch;
