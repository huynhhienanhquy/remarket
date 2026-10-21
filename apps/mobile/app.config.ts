import type { ExpoConfig } from "expo/config";

const profile = process.env.EAS_BUILD_PROFILE;
if (profile === "production" && !process.env.EXPO_PUBLIC_API_BASE_URL?.startsWith("https://")) {
  throw new Error("Production cần EXPO_PUBLIC_API_BASE_URL là API HTTPS công khai.");
}
const config: ExpoConfig = {
  name: "ReMarket", slug: "remarket", version: "0.1.0", scheme: "remarket", orientation: "portrait", platforms: ["ios", "android"],
  userInterfaceStyle: "light",
  ios: { supportsTablet: true, bundleIdentifier: "com.remarket.app", infoPlist: { ITSAppUsesNonExemptEncryption: false } },
  android: { package: "com.remarket.app", permissions: ["android.permission.POST_NOTIFICATIONS"] },
  plugins: ["expo-router", "expo-secure-store", ["expo-build-properties", { ios: { enableSceneSupport: true } }], ["expo-image-picker", {
    photosPermission: "Cho phép ReMarket chọn ảnh để đăng tin hoặc đổi ảnh đại diện.",
    cameraPermission: "Cho phép ReMarket chụp ảnh món đồ bạn muốn đăng bán.", microphonePermission: false,
  }], "expo-notifications"],
  extra: process.env.EXPO_PUBLIC_EAS_PROJECT_ID ? { eas: { projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID } } : {},
};
export default config;
