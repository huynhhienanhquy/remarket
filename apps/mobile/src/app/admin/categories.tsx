import { useState } from "react";
import { Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import type { CategoryNode } from "@remarket/shared";
import { api } from "../../services/runtime";
import { queryClient } from "../../services/session-context";
import { SelectField } from "../../components/SelectField";
import { Sheet } from "../../components/Sheet";
import {
  Button,
  Field,
  Feedback,
  styles,
  useAction,
} from "../../components/ui";
import {
  AdminList,
  AdminSearch,
  AdvancedFilters,
  DecisionSheet,
  moderationFields,
  useAdminList,
} from "../../features/admin/common";
import type { Decision } from "../../features/admin/common";

export default function AdminCategories() {
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [advanced, setAdvanced] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<CategoryNode | "new" | null>(null);
  const [draft, setDraft] = useState({ name: "", slug: "", parent_id: "" });
  const [decision, setDecision] = useState<Decision | null>(null);
  const action = useAction();
  const input = {
    ...advanced,
    q: q || undefined,
    status:
      status === "ACTIVE"
        ? ("ACTIVE" as const)
        : status === "INACTIVE"
          ? ("INACTIVE" as const)
          : undefined,
    page,
  };
  const query = useAdminList("categories", input, () =>
    api.admin.categories(input),
  );
  const tree = useQuery({
    queryKey: ["admin", "category-tree"],
    queryFn: api.admin.categoryTree,
  });
  const edit = (item: CategoryNode | "new") => {
    setEditing(item);
    setDraft(
      item === "new"
        ? { name: "", slug: "", parent_id: "" }
        : { name: item.name, slug: item.slug, parent_id: item.parent_id ?? "" },
    );
  };
  return (
    <AdminList
      title="Danh mục"
      query={query}
      page={page}
      onPage={setPage}
      filters={
        <>
          <Button title="Thêm danh mục" onPress={() => edit("new")} />
          <AdminSearch
            onSearch={(value) => {
              setQ(value);
              setPage(1);
            }}
          />
          <SelectField
            label="Trạng thái"
            value={status}
            items={[
              { value: "", label: "Tất cả" },
              { value: "ACTIVE", label: "Hoạt động" },
              { value: "INACTIVE", label: "Ngừng hoạt động" },
            ]}
            onChange={(value) => {
              setStatus(value);
              setPage(1);
            }}
          />
          <AdvancedFilters
            fields={moderationFields}
            onApply={(value) => {
              setAdvanced(value);
              setPage(1);
            }}
          />
        </>
      }
    >
      {query.data?.items
        .flatMap((root) => [root, ...(root.children ?? [])])
        .map((item) => (
          <View key={item.id} style={styles.card}>
            <Text style={styles.heading}>
              {item.parent_id ? "› " : ""}
              {item.name}
            </Text>
            <Text style={styles.muted}>
              {item.slug} ·{" "}
              {item.status === "ACTIVE" ? "Hoạt động" : "Ngừng hoạt động"}
            </Text>
            <Button title="Chỉnh sửa" secondary onPress={() => edit(item)} />
            <Button
              title={item.status === "ACTIVE" ? "Vô hiệu hóa" : "Kích hoạt"}
              secondary
              onPress={() =>
                setDecision({
                  title:
                    item.status === "ACTIVE"
                      ? "Vô hiệu hóa danh mục"
                      : "Kích hoạt danh mục",
                  description:
                    "Thay đổi trạng thái ảnh hưởng đến việc hiển thị và mua mới các tin liên quan.",
                  danger: item.status === "ACTIVE",
                  run: () =>
                    api.admin.updateCategory(item.id, {
                      status: item.status === "ACTIVE" ? "INACTIVE" : "ACTIVE",
                    }),
                })
              }
            />
          </View>
        ))}
      <Sheet
        visible={!!editing}
        title={editing === "new" ? "Thêm danh mục" : "Sửa danh mục"}
        onClose={() => {
          if (!action.pending) setEditing(null);
        }}
      >
        <Field
          label="Tên danh mục"
          value={draft.name}
          onChangeText={(name) => setDraft({ ...draft, name })}
          maxLength={100}
        />
        <Field
          label="Slug"
          value={draft.slug}
          onChangeText={(slug) => setDraft({ ...draft, slug })}
          autoCapitalize="none"
          hint="Chữ thường, số và dấu gạch ngang."
        />
        <SelectField
          label="Danh mục cha"
          value={draft.parent_id}
          items={[
            { value: "", label: "Không có (danh mục gốc)" },
            ...(tree.data ?? [])
              .filter(
                (item) =>
                  typeof editing === "string" || item.id !== editing?.id,
              )
              .map((item) => ({ value: item.id, label: item.name })),
          ]}
          onChange={(parent_id) => setDraft({ ...draft, parent_id })}
        />
        <Feedback
          error={action.error ?? tree.error}
          retry={() => {
            void tree.refetch();
          }}
        />
        <Button
          title="Lưu danh mục"
          loading={action.pending}
          disabled={!draft.name.trim() || !draft.slug.trim()}
          onPress={() => {
            void action.run(async () => {
              const input = {
                name: draft.name.trim(),
                slug: draft.slug.trim(),
                parent_id: draft.parent_id || null,
              };
              if (editing === "new") await api.admin.createCategory(input);
              else if (editing)
                await api.admin.updateCategory(editing.id, input);
              await queryClient.invalidateQueries();
              setEditing(null);
            }, "Đã lưu danh mục.");
          }}
        />
      </Sheet>
      <DecisionSheet
        key={decision?.title}
        decision={decision}
        onClose={() => setDecision(null)}
      />
    </AdminList>
  );
}
