import { isRunningInExpoGo } from "expo";

// Expo Go has no remote push support. Avoid loading the native push module there.
export const nativeNotifications: typeof import("expo-notifications") | null =
  isRunningInExpoGo()
    ? null
    // Metro needs a literal require so this native module is loaded only in a build.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    : require("expo-notifications");
