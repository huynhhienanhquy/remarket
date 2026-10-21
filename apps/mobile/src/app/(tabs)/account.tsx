import { useEffect, useState } from "react";
import { Alert, Text, View } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import type { SessionUser } from "@remarket/shared";
import {
  USER_STATUS_LABELS,
  validateFullName,
  validatePhone,
} from "@remarket/shared";
import { api, http, session } from "../../services/runtime";
import { useSession } from "../../services/session-context";
import { registerPush, disablePush } from "../../services/push";
import { pickAndUpload } from "../../services/images";
import { MarketplaceImage } from "../../components/MarketplaceImage";
import { SelectField } from "../../components/SelectField";
import { Sheet } from "../../components/Sheet";
import {
  Screen,
  Field,
  Button,
  Feedback,
  LoginPrompt,
  MenuRow,
  useAction,
  styles,
  colors,
} from "../../components/ui";

type Draft = Partial<
  Pick<SessionUser, "full_name" | "phone" | "province_code" | "default_address">
>;
export default function Account() {
  const { user } = useSession();
  const router = useRouter();
  const action = useAction();
  const [draft, setDraft] = useState<Draft>({});
  const [password, setPassword] = useState("");
  const [panel, setPanel] = useState<"profile" | "settings" | "delete" | null>(
    null,
  );
  const provinces = useQuery({
    queryKey: ["provinces"],
    queryFn: api.categories.provinces,
    enabled: !!user,
  });
  useEffect(() => {
    setDraft({});
    setPassword("");
    setPanel(null);
  }, [user?.id]);
  if (!user)
    return (
      <Screen title="Tài khoản">
        <LoginPrompt />
      </Screen>
    );
  const locked = user.status === "LOCKED";
  return (
    <Screen
      title="Tài khoản"
      titleCard
      description={`Chào ${user.full_name}, quản lý thông tin cá nhân và bảo mật tài khoản của bạn.`}
    >
      <View style={[styles.card, { borderRadius: 16 }]}>
        <View style={[styles.row, { flexWrap: "nowrap" }]}>
          {user.avatar_url ? (
            <MarketplaceImage
              uri={user.avatar_url}
              style={{ width: 64, height: 64, borderRadius: 16 }}
            />
          ) : (
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 16,
                backgroundColor: colors.soft,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={[styles.title, { color: colors.green }]}>
                {user.full_name.slice(0, 1).toUpperCase()}
              </Text>
            </View>
          )}
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.heading}>{user.full_name}</Text>
            <Text style={styles.muted}>{user.email}</Text>
            <Text style={styles.meta}>
              {USER_STATUS_LABELS[user.status].label} ·{" "}
              {user.email_verified_at
                ? "Email đã xác minh"
                : "Email chưa xác minh"}
            </Text>
          </View>
        </View>
        {!locked && (
          <Button
            title="Chỉnh sửa hồ sơ"
            secondary
            onPress={() => setPanel("profile")}
          />
        )}
        {!user.email_verified_at && !locked && (
          <Button
            title="Yêu cầu xác minh email"
            onPress={() => router.push("/verify-email")}
          />
        )}
      </View>
      {!locked && (
        <View style={[styles.card, { borderRadius: 16 }]}>
          <Text style={styles.heading}>Mua sắm</Text>
          <MenuRow
            title="Yêu thích"
            icon="heart-outline"
            onPress={() => router.push("/favorites")}
          />
          <MenuRow
            title="Giỏ hàng"
            icon="cart-outline"
            onPress={() => router.push("/cart")}
          />
          <MenuRow
            title="Đơn mua"
            icon="bag-handle-outline"
            onPress={() =>
              router.push({ pathname: "/orders", params: { role: "buyer" } })
            }
          />
        </View>
      )}
      {!locked && (
        <View style={[styles.card, { borderRadius: 16 }]}>
          <Text style={styles.heading}>Bán hàng</Text>
          <MenuRow
            title="Tin đăng của tôi"
            icon="pricetags-outline"
            onPress={() => router.push("/my-products")}
          />
          <MenuRow
            title="Đăng bán món đồ"
            icon="add-circle-outline"
            onPress={() => router.push("/sell")}
          />
          <MenuRow
            title="Đơn bán"
            icon="receipt-outline"
            onPress={() =>
              router.push({ pathname: "/orders", params: { role: "seller" } })
            }
          />
        </View>
      )}
      <View style={[styles.card, { borderRadius: 16 }]}>
        <Text style={styles.heading}>Kết nối và hỗ trợ</Text>
        {locked && (
          <MenuRow
            title="Đơn hàng của tôi"
            icon="receipt-outline"
            onPress={() => router.push("/orders")}
          />
        )}
        {!locked && (
          <MenuRow
            title="Tin nhắn"
            icon="chatbubbles-outline"
            onPress={() => router.push("/messages")}
          />
        )}
        <MenuRow
          title="Thông báo"
          icon="notifications-outline"
          onPress={() => router.push("/notifications")}
        />
        <MenuRow
          title="Trung tâm hỗ trợ"
          icon="help-circle-outline"
          onPress={() => router.push("/support")}
        />
        {!locked && (
          <MenuRow
            title="Báo cáo của tôi"
            icon="flag-outline"
            onPress={() => router.push("/reports")}
          />
        )}
        {!locked && (
          <MenuRow
            title="Người dùng đã chặn"
            icon="ban-outline"
            onPress={() => router.push("/blocks")}
          />
        )}
      </View>
      {user.role === "ADMIN" && !locked && (
        <View style={[styles.card, { borderRadius: 16 }]}>
          <MenuRow
            title="Trang quản trị"
            description="Kiểm duyệt và quản lý ReMarket"
            icon="shield-checkmark-outline"
            onPress={() => router.push("/admin")}
          />
        </View>
      )}
      <View style={[styles.card, { borderRadius: 16 }]}>
        <MenuRow
          title="Cài đặt tài khoản"
          description="Thông báo, bảo mật và đăng xuất"
          icon="settings-outline"
          onPress={() => setPanel("settings")}
        />
      </View>
      <Feedback error={action.error} />
      <Sheet
        visible={panel === "profile"}
        title="Hồ sơ cá nhân"
        onClose={() => setPanel(null)}
      >
        <Field
          label="Họ và tên"
          value={draft.full_name ?? user.full_name}
          onChangeText={(full_name) => setDraft({ ...draft, full_name })}
          maxLength={100}
        />
        <Field
          label="Số điện thoại"
          keyboardType="phone-pad"
          value={(draft.phone === undefined ? user.phone : draft.phone) ?? ""}
          onChangeText={(phone) => setDraft({ ...draft, phone: phone || null })}
        />
        <SelectField
          label="Tỉnh / thành"
          value={
            (draft.province_code === undefined
              ? user.province_code
              : draft.province_code) ?? ""
          }
          items={[
            { value: "", label: "Chưa chọn khu vực" },
            ...(provinces.data ?? []).map((item) => ({
              value: item.code,
              label: item.name,
            })),
          ]}
          onChange={(value) =>
            setDraft({ ...draft, province_code: value || null })
          }
        />
        <Field
          label="Địa chỉ mặc định"
          value={draft.default_address ?? user.default_address ?? ""}
          onChangeText={(default_address) =>
            setDraft({ ...draft, default_address })
          }
          multiline
        />
        <Feedback
          error={action.error ?? provinces.error}
          retry={() => {
            void provinces.refetch();
          }}
        />
        <Button
          title="Lưu hồ sơ"
          loading={action.pending}
          disabled={!Object.keys(draft).length}
          onPress={() => {
            void action.run(async () => {
              const problem =
                validateFullName(draft.full_name ?? user.full_name) ||
                (draft.phone ? validatePhone(draft.phone) : null);
              if (problem) throw new Error(problem);
              await http.patch("/auth/mobile/profile", draft);
              await session.updateIdentity();
              setDraft({});
              setPanel(null);
            }, "Đã lưu hồ sơ.");
          }}
        />
        <Button
          title="Đổi ảnh đại diện"
          secondary
          loading={action.pending}
          onPress={() => {
            void action.run(async () => {
              const uploaded = await pickAndUpload("avatar");
              if (uploaded) {
                await http.patch("/auth/mobile/avatar", {
                  storage_path: uploaded.storage_path,
                });
                await session.updateIdentity();
              }
            });
          }}
        />
      </Sheet>
      <Sheet
        visible={panel === "settings"}
        title="Cài đặt tài khoản"
        onClose={() => setPanel(null)}
      >
        <Text style={styles.heading}>Thông báo</Text>
        <Button
          title="Bật thông báo trên thiết bị"
          secondary
          loading={action.pending}
          onPress={() => {
            void action.run(async () => {
              if (!(await registerPush(true)))
                throw new Error(
                  "Thông báo chưa được cho phép. Bạn có thể bật trong cài đặt thiết bị.",
                );
            }, "Đã bật thông báo.");
          }}
        />
        <Button
          title="Tắt thông báo cho phiên này"
          secondary
          disabled={action.pending}
          onPress={() => {
            void action.run(
              () => disablePush(),
              "Đã tắt thông báo cho phiên này.",
            );
          }}
        />
        <Text style={styles.heading}>Bảo mật</Text>
        {!locked && (
          <Button
            title="Đổi mật khẩu qua email"
            secondary
            onPress={() => {
              setPanel(null);
              router.push("/reset-password");
            }}
          />
        )}
        <Button
          title="Đăng xuất"
          secondary
          loading={action.pending}
          onPress={() => {
            void action.run(async () => {
              const revoked = await session.logout();
              await Image.clearMemoryCache();
              await Image.clearDiskCache();
              if (!revoked)
                Alert.alert(
                  "Đã đăng xuất trên thiết bị",
                  "Chưa thu hồi được phiên trên máy chủ do kết nối. Bạn có thể đăng nhập và dùng Đăng xuất mọi thiết bị để thu hồi phiên cũ.",
                );
            });
          }}
        />
        <Button
          title="Đăng xuất mọi thiết bị"
          secondary
          disabled={action.pending}
          onPress={() => {
            void action.run(async () => {
              if (!(await session.restore()))
                throw new Error("Phiên đã hết hạn. Hãy đăng nhập lại.");
              await http.post("/auth/mobile/logout-all", {});
              await session.expire();
            });
          }}
        />
        <Button
          title="Xóa tài khoản"
          danger
          disabled={action.pending}
          onPress={() => setPanel("delete")}
        />
        <Feedback error={action.error} />
      </Sheet>
      <Sheet
        visible={panel === "delete"}
        title="Xóa tài khoản"
        onClose={() => {
          setPanel(null);
          setPassword("");
        }}
      >
        <Text style={styles.text}>
          Hoàn tất các đơn và yêu cầu hỗ trợ đang mở trước khi xóa. Hồ sơ, nội
          dung bạn tạo và ảnh được xóa; tham chiếu giao dịch được giữ dưới tên
          tài khoản đã xóa.
        </Text>
        <Field
          label="Mật khẩu để xác nhận xóa"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />
        <Feedback error={action.error} />
        <Button
          title="Xóa tài khoản của tôi"
          danger
          disabled={action.pending || !password}
          onPress={() =>
            Alert.alert(
              "Xóa tài khoản",
              "Thao tác này không thể hoàn tác. Bạn xác nhận xóa tài khoản và nội dung của mình?",
              [
                { text: "Giữ tài khoản", style: "cancel" },
                {
                  text: "Xóa tài khoản",
                  style: "destructive",
                  onPress: () => {
                    void action.run(async () => {
                      await http.post("/mobile/delete-account", { password });
                      await session.expire();
                      await Image.clearMemoryCache();
                      await Image.clearDiskCache();
                    }, "Tài khoản đã được xóa.");
                  },
                },
              ],
            )
          }
        />
      </Sheet>
    </Screen>
  );
}
