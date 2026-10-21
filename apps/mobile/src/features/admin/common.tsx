import { useState } from "react";
import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import type { PageMeta } from "@remarket/shared";
import { ApiError } from "@remarket/api-client";
import { useSession, queryClient } from "../../services/session-context";
import {
  Button,
  EmptyState,
  Feedback,
  Field,
  Pagination,
  Screen,
  styles,
  useAction,
} from "../../components/ui";
import { Sheet } from "../../components/Sheet";

export function useAdminList<T>(
  area: string,
  input: object,
  fetch: () => Promise<{ items: T[]; meta: PageMeta }>,
) {
  const { user } = useSession();
  return useQuery({
    queryKey: ["admin", area, user?.id, input],
    queryFn: fetch,
    enabled: user?.role === "ADMIN" && user.status === "ACTIVE",
  });
}

export function AdminList<T>({
  title,
  query,
  page,
  onPage,
  filters,
  children,
}: {
  title: string;
  query: {
    isPending: boolean;
    isRefetching: boolean;
    error: unknown;
    data?: { items: T[]; meta: PageMeta };
    refetch: () => unknown;
  };
  page: number;
  onPage: (page: number) => void;
  filters?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Screen
      title={title}
      titleCard
      onRefresh={() => {
        query.refetch();
      }}
      refreshing={query.isRefetching}
    >
      {filters}
      <Feedback
        loading={query.isPending}
        error={query.error}
        retry={() => {
          query.refetch();
        }}
      />
      {query.data?.items.length === 0 && (
        <EmptyState
          title="Không có kết quả"
          description="Thử thay đổi bộ lọc hoặc kiểm tra lại sau."
        />
      )}
      {children}
      {query.data && (
        <Pagination
          page={page}
          total={query.data.meta.total}
          pageSize={query.data.meta.page_size}
          onChange={onPage}
        />
      )}
    </Screen>
  );
}

export function AdminSearch({
  onSearch,
}: {
  onSearch: (value: string) => void;
}) {
  const [text, setText] = useState("");
  return (
    <View style={styles.card}>
      <Field
        label="Tìm kiếm"
        value={text}
        onChangeText={setText}
        maxLength={100}
        returnKeyType="search"
        onSubmitEditing={() => onSearch(text.trim())}
      />
      <Button
        title="Tìm kiếm"
        secondary
        onPress={() => onSearch(text.trim())}
      />
    </View>
  );
}

export function AdvancedFilters({
  fields,
  onApply,
}: {
  fields: { key: string; label: string }[];
  onApply: (values: Record<string, string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [error, setError] = useState<string>();
  return (
    <>
      <Button title="Bộ lọc nâng cao" secondary onPress={() => setOpen(true)} />
      <Sheet
        visible={open}
        title="Bộ lọc nâng cao"
        onClose={() => setOpen(false)}
      >
        {fields.map((field) => (
          <Field
            key={field.key}
            label={field.label}
            value={draft[field.key] ?? ""}
            onChangeText={(text) => setDraft({ ...draft, [field.key]: text })}
            autoCapitalize="none"
            hint={
              field.key === "from" || field.key === "to"
                ? "YYYY-MM-DD"
                : undefined
            }
          />
        ))}
        {error && <Text style={styles.error}>{error}</Text>}
        <Button
          title="Áp dụng"
          onPress={() => {
            if (
              (draft.from && !/^\d{4}-\d{2}-\d{2}$/.test(draft.from)) ||
              (draft.to && !/^\d{4}-\d{2}-\d{2}$/.test(draft.to)) ||
              (draft.from && draft.to && draft.from > draft.to)
            ) {
              setError("Kiểm tra khoảng ngày và định dạng YYYY-MM-DD.");
              return;
            }
            onApply(
              Object.fromEntries(
                Object.entries(draft)
                  .filter(([, value]) => value.trim())
                  .map(([key, value]) => [key, value.trim()]),
              ),
            );
            setOpen(false);
            setError(undefined);
          }}
        />
        <Button
          title="Xóa bộ lọc"
          secondary
          onPress={() => {
            setDraft({});
            onApply({});
            setOpen(false);
            setError(undefined);
          }}
        />
      </Sheet>
    </>
  );
}

export const periodFields = [
  { key: "from", label: "Từ ngày" },
  { key: "to", label: "Đến ngày" },
];
export const moderationFields = [
  { key: "handled_by", label: "Mã quản trị viên xử lý" },
  ...periodFields,
];

export type Decision = {
  title: string;
  description?: string;
  reason?: boolean;
  danger?: boolean;
  run: (note: string) => Promise<unknown>;
};
export function DecisionSheet({
  decision,
  onClose,
}: {
  decision: Decision | null;
  onClose: () => void;
}) {
  const [note, setNote] = useState("");
  const action = useAction();
  return (
    <Sheet
      visible={!!decision}
      title={decision?.title ?? "Xác nhận"}
      onClose={() => {
        if (!action.pending) {
          setNote("");
          onClose();
        }
      }}
    >
      {decision?.description && (
        <Text style={styles.text}>{decision.description}</Text>
      )}
      {decision?.reason && (
        <Field
          label="Lý do / kết luận xử lý"
          value={note}
          onChangeText={setNote}
          multiline
          maxLength={1000}
        />
      )}
      <Feedback error={action.error} />
      <Button
        title="Xác nhận"
        danger={decision?.danger}
        loading={action.pending}
        disabled={decision?.reason && !note.trim()}
        onPress={() => {
          if (!decision) return;
          void action.run(async () => {
            try {
              await decision.run(note.trim());
            } catch (error) {
              if (
                error instanceof ApiError &&
                ["VERSION_CONFLICT", "INVALID_ORDER_TRANSITION"].includes(
                  error.code,
                )
              ) {
                await queryClient.invalidateQueries();
                throw new Error(
                  "Dữ liệu đã thay đổi. Đóng hộp thoại và xem bản mới nhất trước khi xử lý.",
                );
              }
              throw error;
            }
            await queryClient.invalidateQueries();
            setNote("");
            onClose();
          }, "Đã cập nhật.");
        }}
      />
    </Sheet>
  );
}
