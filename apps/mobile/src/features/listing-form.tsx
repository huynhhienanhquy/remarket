import { SelectField } from "../components/SelectField";
import { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { MarketplaceImage } from "../components/MarketplaceImage";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import {
  CONDITIONS,
  DELIVERY_METHODS,
  validatePrice,
  validateShippingFee,
  CONDITION_LABELS,
  validateProductTitle,
  validateDescription,
  validateUsageMonths,
  validateCategory,
} from "@remarket/shared";
import type { CategoryNode } from "@remarket/shared";
import type { ProductInput } from "@remarket/api-client";
import { ApiError } from "@remarket/api-client";
import { api } from "../services/runtime";
import { useSession, queryClient } from "../services/session-context";
import { pickAndUpload } from "../services/images";
import { reorderImages } from "../services/marketplace";
import {
  Screen,
  Field,
  Button,
  Feedback,
  LoginPrompt,
  useAction,
  styles,
  fieldError,
} from "../components/ui";

const initial: ProductInput = {
  title: "",
  description: "",
  category_id: "",
  price: "",
  condition: "GOOD",
  usage_months: null,
  province_code: "",
  delivery_method: "BOTH",
  shipping_fee: "0",
  images: [],
};
function leaves(categories: CategoryNode[]): CategoryNode[] {
  return categories.flatMap((item) =>
    item.children?.length ? leaves(item.children) : [item],
  );
}
export default function ListingForm() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const { user } = useSession();
  const action = useAction();
  const [draft, setDraft] = useState<ProductInput>(initial);
  const [usage, setUsage] = useState("");
  const hydrated = useRef<string | undefined>(undefined);
  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: api.categories.tree,
  });
  const provinces = useQuery({
    queryKey: ["provinces"],
    queryFn: api.categories.provinces,
  });
  const existing = useQuery({
    queryKey: ["products", "edit", id, user?.id],
    queryFn: () => api.products.detail(id!),
    enabled: !!id && !!user,
  });
  useEffect(() => {
    setDraft(initial);
    setUsage("");
    hydrated.current = undefined;
  }, [user?.id, id]);
  useEffect(() => {
    const item = existing.data;
    if (!item || hydrated.current === item.id) return;
    hydrated.current = item.id;
    setDraft({
      title: item.title,
      description: item.description,
      category_id: item.category_id,
      price: item.price,
      condition: item.condition,
      usage_months: item.usage_months,
      province_code: item.province_code,
      delivery_method: item.delivery_method,
      shipping_fee: item.shipping_fee,
      images: item.images.map((image) => ({
        url: image.url,
        storage_path: image.storage_path,
        sort_order: image.sort_order,
      })),
    });
    setUsage(item.usage_months?.toString() ?? "");
  }, [existing.data]);
  const patch = <K extends keyof ProductInput>(
    key: K,
    value: ProductInput[K],
  ) => setDraft((previous) => ({ ...previous, [key]: value }));
  const upload = (camera = false) => {
    void action.run(async () => {
      const image = await pickAndUpload("product", camera);
      if (image)
        setDraft((previous) => ({
          ...previous,
          images: [
            ...previous.images,
            { ...image, sort_order: previous.images.length },
          ],
        }));
    });
  };
  if (!user)
    return (
      <Screen title="Đăng bán món đồ">
        <LoginPrompt />
      </Screen>
    );
  if (!user.email_verified_at)
    return (
      <Screen title="Đăng bán món đồ">
        <Text style={styles.text}>Xác minh email trước khi đăng bán.</Text>
        <Button
          title="Xác minh email"
          onPress={() => router.push("/verify-email")}
        />
      </Screen>
    );
  return (
    <Screen
      title={id ? "Chỉnh sửa tin đăng" : "Đăng tin mới"}
      description="Thêm thông tin, ảnh thật và cách giao nhận món đồ của bạn."
      footer={
        <View
          style={{ gap: 8, width: "100%", maxWidth: 760, alignSelf: "center" }}
        >
          <Button
            title={action.pending ? "Đang lưu…" : "Lưu tin đăng"}
            disabled={
              action.pending || (!!id && !existing.data?.capabilities.can_edit)
            }
            onPress={() => {
              void action.run(async () => {
                const error =
                  validateProductTitle(draft.title) ||
                  validateDescription(draft.description) ||
                  validateCategory(draft.category_id) ||
                  validateUsageMonths(usage) ||
                  validatePrice(draft.price) ||
                  validateShippingFee(
                    draft.shipping_fee,
                    draft.delivery_method !== "MEETUP",
                  );
                if (error) throw new Error(error);
                if (!draft.province_code)
                  throw new Error("Hãy chọn tỉnh / thành.");
                if (!draft.images.length || draft.images.length > 8)
                  throw new Error("Tin đăng cần từ 1 đến 8 ảnh.");
                if (usage && (!/^\d+$/.test(usage) || Number(usage) > 1200))
                  throw new Error(
                    "Số tháng sử dụng phải là số nguyên từ 0 đến 1200.",
                  );
                const input = {
                  ...draft,
                  usage_months: usage ? Number(usage) : null,
                };
                const product = id
                  ? await api.products.update(id, input, existing.data!.version)
                  : await api.products.create(input);
                await queryClient.invalidateQueries();
                setDraft(initial);
                router.push(`/products/${product.id}`);
              }, "Đã lưu tin. Xem trạng thái và gửi duyệt trong Tin của tôi.");
            }}
          />
          <Button
            title="Tin của tôi"
            secondary
            onPress={() => router.push("/my-products")}
          />
        </View>
      }
    >
      <Feedback
        error={
          action.error ?? existing.error ?? categories.error ?? provinces.error
        }
        loading={!!id && existing.isPending}
        retry={() => {
          void existing.refetch();
          void categories.refetch();
          void provinces.refetch();
        }}
      />
      {action.error instanceof ApiError &&
        action.error.code === "VERSION_CONFLICT" && (
          <Button
            title="Tải lại bản tin mới nhất"
            secondary
            onPress={() => {
              void action.run(async () => {
                hydrated.current = undefined;
                await existing.refetch();
              });
            }}
          />
        )}
      <View style={[styles.card, { gap: 16 }]}>
        <Text style={styles.heading}>Thông tin cơ bản</Text>
        <Field
          label="Tên món đồ"
          maxLength={150}
          error={fieldError(action.error, "title")}
          value={draft.title}
          onChangeText={(text) => patch("title", text)}
        />
        <Field
          label="Mô tả"
          maxLength={5000}
          error={fieldError(action.error, "description")}
          value={draft.description}
          multiline
          onChangeText={(text) => patch("description", text)}
        />
        <SelectField
          label="Danh mục"
          value={draft.category_id}
          items={leaves(categories.data ?? [])
            .filter((item) => item.status === "ACTIVE")
            .map((item) => ({ value: item.id, label: item.name }))}
          onChange={(value) => patch("category_id", value)}
        />
        <Field
          label="Giá bán (VND)"
          error={fieldError(action.error, "price")}
          value={draft.price}
          keyboardType="number-pad"
          onChangeText={(text) => patch("price", text.replace(/\D/g, ""))}
        />
        <Text style={styles.heading}>Tình trạng</Text>
        <View style={styles.row}>
          {CONDITIONS.map((condition) => (
            <Button
              key={condition}
              title={CONDITION_LABELS[condition]}
              secondary={draft.condition !== condition}
              onPress={() => patch("condition", condition)}
            />
          ))}
        </View>
        <Field
          label="Số tháng đã sử dụng (có thể để trống)"
          value={usage}
          keyboardType="number-pad"
          onChangeText={setUsage}
        />
        <SelectField
          label="Tỉnh / thành"
          value={draft.province_code}
          items={(provinces.data ?? []).map((item) => ({
            value: item.code,
            label: item.name,
          }))}
          onChange={(value) => patch("province_code", value)}
        />
      </View>
      <View style={[styles.card, { gap: 16 }]}>
        <Text style={styles.heading}>Giao nhận</Text>
        <View style={styles.row}>
          {DELIVERY_METHODS.map((method) => (
            <Button
              key={method}
              title={
                method === "BOTH"
                  ? "COD hoặc gặp mặt"
                  : method === "MEETUP"
                    ? "Gặp mặt"
                    : "COD"
              }
              secondary={draft.delivery_method !== method}
              onPress={() =>
                setDraft((old) => ({
                  ...old,
                  delivery_method: method,
                  shipping_fee: method === "MEETUP" ? "0" : old.shipping_fee,
                }))
              }
            />
          ))}
        </View>
        <Field
          label="Phí giao hàng (VND)"
          error={fieldError(action.error, "shipping_fee")}
          editable={draft.delivery_method !== "MEETUP"}
          value={draft.shipping_fee}
          keyboardType="number-pad"
          onChangeText={(text) =>
            patch("shipping_fee", text.replace(/\D/g, ""))
          }
        />
      </View>
      <View style={[styles.card, { gap: 16 }]}>
        <Text style={styles.heading}>
          Ảnh sản phẩm ({draft.images.length}/8)
        </Text>
        {draft.images.map((image, index) => (
          <View key={image.storage_path ?? image.url} style={styles.card}>
            <MarketplaceImage
              uri={image.url}
              style={{ width: "100%", height: 180 }}
              contentFit="cover"
            />
            <Button
              title="Bỏ ảnh này"
              disabled={action.pending}
              secondary
              onPress={() =>
                patch(
                  "images",
                  draft.images
                    .filter((_, i) => i !== index)
                    .map((item, order) => ({ ...item, sort_order: order })),
                )
              }
            />
            <View style={styles.row}>
              <Button
                title={index === 0 ? "Ảnh đại diện" : "Đặt làm ảnh đại diện"}
                secondary
                disabled={index === 0 || action.pending}
                onPress={() =>
                  patch("images", reorderImages(draft.images, index, 0))
                }
              />
              <Button
                title="Sang trái"
                secondary
                disabled={index === 0 || action.pending}
                onPress={() =>
                  patch("images", reorderImages(draft.images, index, index - 1))
                }
              />
              <Button
                title="Sang phải"
                secondary
                disabled={index === draft.images.length - 1 || action.pending}
                onPress={() =>
                  patch("images", reorderImages(draft.images, index, index + 1))
                }
              />
            </View>
          </View>
        ))}
        <View style={styles.row}>
          <Button
            title="Chọn ảnh"
            secondary
            disabled={action.pending || draft.images.length >= 8}
            onPress={() => upload()}
          />
          <Button
            title="Chụp ảnh"
            secondary
            disabled={action.pending || draft.images.length >= 8}
            onPress={() => upload(true)}
          />
        </View>
      </View>
      <Feedback error={action.error} />
    </Screen>
  );
}
