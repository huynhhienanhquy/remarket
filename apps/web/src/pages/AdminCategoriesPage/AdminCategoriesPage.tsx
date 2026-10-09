import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CategoryNode } from "@remarket/shared";
import { api } from "../../services/api";
import { queryKeys } from "../../config/queryClient";
import { Button, ConfirmDialog, EmptyState, FormField, Input, Pagination, SearchInput, SectionCard, Select, StatusBadge, useToast } from "../../components/common";
import { AdminHeading } from "../../components/admin/AdminHeading/AdminHeading";
import { AdminAdvancedFilters, AdminToolbar, ToolbarField } from "../../components/admin/AdminToolbar/AdminToolbar";
import { QueryErrorAlert } from "../../components/admin/QueryErrorAlert/QueryErrorAlert";
import { errorDescription, fieldError } from "../../helpers/adminErrors";
import { readEnumParam, readPage } from "../../utils/adminParams";
import { useAdminParams } from "../../hooks/useAdminParams";

function slugify(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/gi, "d").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function findCategory(nodes: CategoryNode[], id: string | null): CategoryNode | null {
  if (!id) return null;
  for (const node of nodes) {
    if (node.id === id) return node;
    const child = node.children?.find((item) => item.id === id);
    if (child) return child;
  }
  return null;
}

export function AdminCategoriesPage() {
  const { params, apply } = useAdminParams();
  const queryClient = useQueryClient();
  const toast = useToast();
  const page = readPage(params);
  const status = readEnumParam(params, "status", ["ACTIVE", "INACTIVE"] as const);
  const [search, setSearch] = useState(params.get("q") ?? "");
  useEffect(() => setSearch(params.get("q") ?? ""), [params]);
  const tree = useQuery({ queryKey: queryKeys.adminCategoryTree, queryFn: () => api.admin.categoryTree() });
  const queryInput = useMemo(() => ({
    ...(params.get("q") ? { q: params.get("q")! } : {}),
    ...(status ? { status } : {}),
    ...(params.get("handled_by") ? { handled_by: params.get("handled_by")! } : {}),
    ...(params.get("from") ? { from: params.get("from")! } : {}),
    ...(params.get("to") ? { to: params.get("to")! } : {}),
    page,
  }), [params, page, status]);
  const query = useQuery({ queryKey: queryKeys.adminCategories(queryInput), queryFn: () => api.admin.categories(queryInput) });
  const selected = findCategory(tree.data ?? [], params.get("selected"));
  const creating = params.get("new") === "1";
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [parentId, setParentId] = useState("");
  const [manualSlug, setManualSlug] = useState(false);
  const [confirmDisable, setConfirmDisable] = useState(false);

  useEffect(() => {
    if (creating) { setName(""); setSlug(""); setParentId(""); setManualSlug(false); return; }
    if (selected) { setName(selected.name); setSlug(selected.slug); setParentId(selected.parent_id ?? ""); setManualSlug(true); }
  }, [creating, selected]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (creating) return api.admin.createCategory({ name, slug, parent_id: parentId || null });
      if (!selected) throw new Error("Chưa chọn danh mục.");
      return api.admin.updateCategory(selected.id, { name, slug, parent_id: parentId || null });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.categories });
      void queryClient.invalidateQueries({ queryKey: ["admin", "categories"] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "audit"] });
      toast.success(creating ? "Đã tạo danh mục" : "Đã cập nhật danh mục");
      apply({ new: null, selected: null }, { replace: true });
    },
    onError: (error) => toast.error("Không thể lưu danh mục", { description: errorDescription(error) }),
  });

  const statusMutation = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("Chưa chọn danh mục.");
      return api.admin.updateCategory(selected.id, { status: selected.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" });
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: queryKeys.categories }); void queryClient.invalidateQueries({ queryKey: ["admin", "categories"] }); void queryClient.invalidateQueries({ queryKey: ["admin", "audit"] }); toast.success(selected?.status === "ACTIVE" ? "Đã vô hiệu danh mục" : "Đã kích hoạt danh mục"); setConfirmDisable(false); },
    onError: (error) => toast.error("Không thể đổi trạng thái danh mục", { description: errorDescription(error) }),
  });

  const roots = useMemo(() => query.data?.items ?? [], [query.data]);
  const parentOptions = useMemo(() => (tree.data ?? []).filter((root) => root.id !== selected?.id), [tree.data, selected]);
  const editorVisible = creating || selected !== null;

  return <div>
    <AdminHeading title="Danh mục" description="Quản lý cây danh mục tối đa hai cấp và trạng thái nhận tin đăng." actions={<Button onClick={() => apply({ new: "1", selected: null })}>Thêm danh mục</Button>} />
    <AdminToolbar>
      <SearchInput value={search} onValueChange={setSearch} onSubmit={() => apply({ q: search.trim() || null })} label="Tìm danh mục" placeholder="Tên danh mục" />
      <ToolbarField label="Trạng thái" htmlFor="category-status"><Select id="category-status" value={status} onChange={(event) => apply({ status: event.target.value || null })}><option value="">Tất cả</option><option value="ACTIVE">Hoạt động</option><option value="INACTIVE">Vô hiệu</option></Select></ToolbarField>
<AdminAdvancedFilters fields={["handled_by", "from", "to"]}>
      <ToolbarField label="Người xử lý" htmlFor="category-handler"><Input id="category-handler" value={params.get("handled_by") ?? ""} onChange={(event) => apply({ handled_by: event.target.value || null })} placeholder="UUID quản trị viên" /></ToolbarField>
      <ToolbarField label="Thao tác từ ngày" htmlFor="category-from"><Input id="category-from" type="date" value={params.get("from") ?? ""} onChange={(event) => apply({ from: event.target.value || null })} /></ToolbarField>
      <ToolbarField label="Đến ngày" htmlFor="category-to"><Input id="category-to" type="date" value={params.get("to") ?? ""} onChange={(event) => apply({ to: event.target.value || null })} /></ToolbarField></AdminAdvancedFilters>
    </AdminToolbar>
    {tree.isError && <QueryErrorAlert error={tree.error} onRetry={() => tree.refetch()} />}
    {query.isError ? <QueryErrorAlert error={query.error} onRetry={() => query.refetch()} /> : <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
      <SectionCard title="Cây danh mục" bodyClassName="p-2 lg:p-2">
        <p className="px-3 py-2 t-meta text-muted">Mỗi trang gồm các nhóm có danh mục phù hợp bộ lọc; giữ cả danh mục cha và con để dễ quản lý.</p>
        {query.isPending ? <div className="p-4 t-body text-muted">Đang tải danh mục…</div> : roots.length === 0 ? <EmptyState title="Chưa có danh mục" action={{ label: "Thêm danh mục", onClick: () => apply({ new: "1", selected: null }) }} /> : <ul className="space-y-1">
          {roots.map((root) => <li key={root.id}>
            <button type="button" onClick={() => apply({ selected: root.id, new: null })} className={`flex w-full items-center justify-between gap-2 rounded-control px-3 py-2.5 text-left ${selected?.id === root.id ? "bg-brand-soft text-brand" : "hover:bg-surface-subtle"}`}><span className="t-label">{root.name}</span><StatusBadge label={root.status === "ACTIVE" ? "Hoạt động" : "Vô hiệu"} tone={root.status === "ACTIVE" ? "brand" : "neutral"} size="sm" /></button>
            {root.children && root.children.length > 0 && <ul className="ml-4 border-l border-line pl-2">{root.children.map((child) => <li key={child.id}><button type="button" onClick={() => apply({ selected: child.id, new: null })} className={`flex w-full items-center justify-between gap-2 rounded-control px-3 py-2.5 text-left ${selected?.id === child.id ? "bg-brand-soft text-brand" : "hover:bg-surface-subtle"}`}><span className="truncate t-body">{child.name}</span><StatusBadge label={child.status === "ACTIVE" ? "Hoạt động" : "Vô hiệu"} tone={child.status === "ACTIVE" ? "brand" : "neutral"} size="sm" /></button></li>)}</ul>}
          </li>)}
        </ul>}
        {query.data && <Pagination page={query.data.meta.page} totalPages={query.data.meta.total_pages} total={query.data.meta.total} onPageChange={(next) => apply({ page: String(next) })} />}
      </SectionCard>
      <SectionCard title={creating ? "Thêm danh mục" : selected ? "Chỉnh sửa danh mục" : "Thông tin danh mục"}>
        {!editorVisible ? <EmptyState title="Chọn một danh mục" description="Chọn bên trái để chỉnh sửa hoặc tạo danh mục mới." /> : <form className="space-y-5" onSubmit={(event) => { event.preventDefault(); mutation.mutate(); }}>
          <FormField label="Tên danh mục" htmlFor="category-name" required error={fieldError(mutation.error, "name")}><Input id="category-name" value={name} maxLength={100} onChange={(event) => { const value = event.target.value; setName(value); if (!manualSlug) setSlug(slugify(value)); }} /></FormField>
          <FormField label="Slug" htmlFor="category-slug" required helper="Chỉ dùng chữ thường, số và dấu gạch ngang." error={fieldError(mutation.error, "slug")}><Input id="category-slug" value={slug} maxLength={120} onChange={(event) => { setManualSlug(true); setSlug(event.target.value); }} /></FormField>
          <FormField label="Danh mục cha" htmlFor="category-parent" helper="Để trống nếu đây là danh mục cấp một." error={fieldError(mutation.error, "parent_id")}><Select id="category-parent" value={parentId} disabled={Boolean(selected?.children?.length)} onChange={(event) => setParentId(event.target.value)}><option value="">Không có — danh mục cấp một</option>{parentOptions.map((root) => <option key={root.id} value={root.id}>{root.name}</option>)}</Select></FormField>
          {selected && <div className="rounded-card bg-surface-subtle p-4"><p className="t-meta text-muted">Trạng thái hiện tại</p><div className="mt-2 flex items-center justify-between gap-3"><StatusBadge label={selected.status === "ACTIVE" ? "Hoạt động" : "Vô hiệu"} tone={selected.status === "ACTIVE" ? "brand" : "neutral"} /><Button variant={selected.status === "ACTIVE" ? "danger" : "secondary"} onClick={() => selected.status === "ACTIVE" ? setConfirmDisable(true) : statusMutation.mutate()} loading={statusMutation.isPending}>{selected.status === "ACTIVE" ? "Vô hiệu" : "Kích hoạt"}</Button></div></div>}
          <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => apply({ selected: null, new: null })}>Hủy</Button><Button type="submit" loading={mutation.isPending}>Lưu danh mục</Button></div>
        </form>}
      </SectionCard>
    </div>}
    {selected && confirmDisable && <ConfirmDialog title={`Vô hiệu “${selected.name}”?`} description="Tin liên quan sẽ ngừng hiển thị hoặc mua mới; đơn chờ xác nhận có thể bị hủy và giải phóng hàng theo quy tắc hệ thống." confirmLabel="Vô hiệu danh mục" loading={statusMutation.isPending} onConfirm={() => statusMutation.mutate()} onCancel={() => setConfirmDisable(false)} />}
  </div>;
}
