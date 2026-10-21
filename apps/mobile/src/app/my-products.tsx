import { PRODUCT_STATUSES, PRODUCT_STATUS_LABELS } from "@remarket/shared";
import { SelectField } from "../components/SelectField";
import { Text, View, Alert } from "react-native";
import { useState } from "react";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "../services/runtime";
import { useSession, queryClient } from "../services/session-context";
import {
  Screen,
  Button,
  Feedback,
  LoginPrompt,
  ProductCard,
  useAction,
  styles,
} from "../components/ui";
export default function MyProducts() {
  const { user } = useSession();
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const action = useAction();
  const result = useQuery({
    queryKey: ["products", "mine", user?.id, page, status],
    queryFn: () =>
      api.products.mine({
        page,
        status: PRODUCT_STATUSES.find((value) => value === status),
      }),
    enabled: !!user,
  });
  return (
    <Screen
      title="Tin đăng của tôi"
      titleCard
      description="Quản lý tin đăng, theo dõi trạng thái và cập nhật món đồ của bạn."
    >
      {!user ? (
        <LoginPrompt />
      ) : (
        <>
          <Button
            title="Đăng bán món đồ"
            onPress={() => router.push("/sell")}
          />
          <SelectField
            label="Trạng thái tin"
            value={status}
            items={[
              { value: "", label: "Tất cả tin đăng" },
              ...PRODUCT_STATUSES.map((value) => ({
                value,
                label: PRODUCT_STATUS_LABELS[value].label,
              })),
            ]}
            onChange={(value) => {
              setStatus(value);
              setPage(1);
            }}
          />
          <Feedback
            loading={result.isPending}
            error={result.error ?? action.error}
            retry={() => {
              void result.refetch();
            }}
          />
          {result.data?.items.map((product) => (
            <View key={product.id} style={{ gap: 8 }}>
              <ProductCard product={product} />
              <Text style={styles.muted}>
                {PRODUCT_STATUS_LABELS[product.status].label}{" "}
                {product.rejection_reason}
              </Text>
              <View style={styles.row}>
                {product.allowed_actions.includes("edit") && (
                  <Button
                    title="Chỉnh sửa"
                    secondary
                    onPress={() => router.push(`/edit-product/${product.id}`)}
                  />
                )}
                {(product.allowed_actions.includes("submit") ||
                  product.allowed_actions.includes("resubmit")) && (
                  <Button
                    title="Gửi duyệt"
                    disabled={action.pending}
                    onPress={() => {
                      void action.run(async () => {
                        await api.products.submit(product.id);
                        await queryClient.invalidateQueries();
                      });
                    }}
                  />
                )}
                {product.allowed_actions.includes("hide") && (
                  <Button
                    title="Ẩn tin"
                    secondary
                    disabled={action.pending}
                    onPress={() => {
                      void action.run(async () => {
                        await api.products.hide(product.id);
                        await queryClient.invalidateQueries();
                      });
                    }}
                  />
                )}
                {product.allowed_actions.includes("delete") && (
                  <Button
                    title="Xóa tin"
                    secondary
                    onPress={() =>
                      Alert.alert("Xóa tin", "Xóa tin đăng này?", [
                        { text: "Hủy", style: "cancel" },
                        {
                          text: "Xóa",
                          style: "destructive",
                          onPress: () => {
                            void action.run(async () => {
                              await api.products.remove(product.id);
                              await queryClient.invalidateQueries();
                            });
                          },
                        },
                      ])
                    }
                  />
                )}
              </View>
            </View>
          ))}
          {result.data?.items.length === 0 && (
            <Text style={styles.muted}>Bạn chưa có tin đăng.</Text>
          )}
          <Button
            title="Trang trước"
            secondary
            disabled={page === 1}
            onPress={() => setPage(page - 1)}
          />
          <Button
            title="Trang sau"
            secondary
            disabled={!result.data || page >= result.data.meta.total_pages}
            onPress={() => setPage(page + 1)}
          />
        </>
      )}
    </Screen>
  );
}
