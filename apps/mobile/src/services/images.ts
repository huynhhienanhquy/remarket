import { Alert } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { File } from "expo-file-system";
import { ApiError } from "@remarket/api-client";
import { http, session } from "./runtime";

export async function pickAndUpload(
  purpose: "product" | "avatar",
  camera = false,
): Promise<{ url: string; storage_path: string } | null> {
  const generation = session.getGeneration();
  if (camera && !(await ImagePicker.requestCameraPermissionsAsync()).granted) {
    Alert.alert("Quyền máy ảnh", "Cho phép máy ảnh trong cài đặt để chụp ảnh.");
    return null;
  }
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ["images"],
    quality: 1,
    allowsMultipleSelection: false,
  };
  const picked = camera
    ? await ImagePicker.launchCameraAsync(options)
    : await ImagePicker.launchImageLibraryAsync(options);
  const asset = picked.assets?.[0];
  if (picked.canceled || !asset) return null;
  const context = ImageManipulator.manipulate(asset.uri);
  if (asset.width >= asset.height)
    context.resize({ width: Math.min(asset.width, 1600) });
  else context.resize({ height: Math.min(asset.height, 1600) });
  const rendered = await context.renderAsync();
  let output = await rendered.saveAsync({
    compress: 0.8,
    format: SaveFormat.JPEG,
  });
  if (new File(output.uri).size > 5 * 1024 * 1024)
    output = await rendered.saveAsync({
      compress: 0.5,
      format: SaveFormat.JPEG,
    });
  if (new File(output.uri).size > 5 * 1024 * 1024)
    throw new Error("Ảnh sau xử lý vẫn lớn hơn 5 MB. Hãy chọn ảnh khác.");
  const form = new FormData();
  form.append("purpose", purpose);
  form.append("file", {
    uri: output.uri,
    name: "remarket-photo.jpg",
    type: "image/jpeg",
  } as unknown as Blob);
  try {
    if (session.getGeneration() !== generation)
      throw new ApiError({
        code: "SESSION_CHANGED",
        message: "Phiên đăng nhập đã thay đổi. Vui lòng chọn ảnh lại.",
        status: 409,
      });
    return await http.post("/uploads", form);
  } finally {
    new File(output.uri).delete();
  }
}
