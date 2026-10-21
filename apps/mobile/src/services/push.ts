import { randomUUID } from "expo-crypto";
import { Platform } from "react-native";
import { nativeNotifications as Notifications } from "./native-notifications";
import * as SecureStore from "expo-secure-store";
import Constants from "expo-constants";
import { http, session } from "./runtime";

Notifications?.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});
export async function registerPush(
  requestPermission = false,
): Promise<boolean> {
  if (!Notifications) {
    if (requestPermission)
      throw new Error("Expo Go không hỗ trợ push. Dùng development build để thử thông báo đẩy; hộp thông báo trong app vẫn hoạt động.");
    return false;
  }
  const generation = session.getGeneration();
  const user = session.getSnapshot().user;
  if (!user || !["ios", "android"].includes(Platform.OS)) return false;
  if (
    !requestPermission &&
    (await SecureStore.getItemAsync(`remarket.push.enabled.${user.id}`)) === "0"
  )
    return false;
  const projectId =
    process.env.EXPO_PUBLIC_EAS_PROJECT_ID ?? Constants.easConfig?.projectId;
  if (!projectId) {
    if (requestPermission)
      throw new Error("Thông báo đẩy chưa được cấu hình cho bản app này.");
    return false;
  }
  if (Platform.OS === "android")
    await Notifications.setNotificationChannelAsync("default", {
      name: "ReMarket",
      importance: Notifications.AndroidImportance.HIGH,
    });
  let permission = await Notifications.getPermissionsAsync();
  if (!permission.granted && requestPermission)
    permission = await Notifications.requestPermissionsAsync();
  if (!permission.granted) return false;
  const token = await Notifications.getExpoPushTokenAsync({ projectId });
  let installation = await SecureStore.getItemAsync("remarket.installation.v1");
  if (!installation) {
    installation = randomUUID();
    await SecureStore.setItemAsync("remarket.installation.v1", installation);
  }
  if (session.getGeneration() !== generation) return false;
  await http.put("/mobile/push-registration", {
    installation_id: installation,
    token: token.data,
    platform: Platform.OS,
  });
  if (session.getGeneration() === generation)
    await SecureStore.setItemAsync(`remarket.push.enabled.${user.id}`, "1");
  return true;
}

export async function disablePush() {
  const user = session.getSnapshot().user;
  if (!user) return;
  await SecureStore.setItemAsync(`remarket.push.enabled.${user.id}`, "0");
  await http.delete("/mobile/push-registration");
}
