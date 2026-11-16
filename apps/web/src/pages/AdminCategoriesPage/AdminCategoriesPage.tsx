import type { CategoryNode } from "@remarket/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AdminHeading } from "../../components/admin/AdminHeading/AdminHeading";
import { AdminMetrics, AdminPill } from "../../components/admin/AdminSummary/AdminSummary";
import { AdminAdvancedFilters, AdminToolbar, ToolbarField } from "../../components/admin/AdminToolbar/AdminToolbar";
import { QueryErrorAlert } from "../../components/admin/QueryErrorAlert/QueryErrorAlert";
import { Button } from "../../components/common/Button/Button";
import { CategoryIcon, categorySymbols, Icon } from "../../components/common/Icon/Icon";
import { ConfirmDialog } from "../../components/common/Dialog/Dialog";
import { EmptyState } from "../../components/common/EmptyState/EmptyState";
import { FormField } from "../../components/common/FormField/FormField";
import { Input, Select, Textarea } from "../../components/common/Input/Input";
import { Pagination } from "../../components/common/Pagination/Pagination";
import { SearchInput } from "../../components/common/SearchInput/SearchInput";
import { Skeleton } from "../../components/common/Skeleton/Skeleton";
import { useToast } from "../../components/common/Toast/Toast";
import { queryKeys } from "../../config/queryClient";
import { invalidateAdminResources } from "../../helpers/adminCache";
import { errorDescription, fieldError } from "../../helpers/adminErrors";
import { useAdminParams } from "../../hooks/useAdminParams";
import { api, apiForQuery } from "../../services/api";
import { readEnumParam, readPage } from "../../utils/adminParams";

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

function CategoryStatus({ category, selected = false }: { category: CategoryNode; selected?: boolean }) {
  return <AdminPill tone={category.status === "ACTIVE" ? "brand" : "neutral"}>{selected ? "Đang chọn" : category.status === "ACTIVE" ? "Hoạt động" : "Vô hiệu"}</AdminPill>;
}

export function AdminCategoriesPage() {
  const { params, apply } = useAdminParams();
  const queryClient = useQueryClient();
  const toast = useToast();
  const page = readPage(params);
  const status = readEnumParam(params, "status", ["ACTIVE", "INACTIVE"] as const);
  const [search, setSearch] = useState(params.get("q") ?? "");
  useEffect(() => setSearch(params.get("q") ?? ""), [params]);
  const tree = useQuery({ queryKey: queryKeys.adminCategoryTree, queryFn: ({ signal }) => apiForQuery(signal).admin.categoryTree() });
  const queryInput = useMemo(() => ({
    ...(params.get("q") ? { q: params.get("q")! } : {}),
    ...(status ? { status } : {}),
    ...(params.get("handled_by") ? { handled_by: params.get("handled_by")! } : {}),
    ...(params.get("from") ? { from: params.get("from")! } : {}),
    ...(params.get("to") ? { to: params.get("to")! } : {}),
    page,
  }), [params, page, status]);
  const query = useQuery({ queryKey: queryKeys.adminCategories(queryInput), queryFn: ({ signal }) => apiForQuery(signal).admin.categories(queryInput) });
  const selectedParam = params.get("selected");
  const selected = findCategory(tree.data ?? [], selectedParam);
  const creating = params.get("new") === "1";
  const selectionInitialized = useRef(false);
  useEffect(() => {
    if (selectionInitialized.current) return;
    if (creating || selectedParam) {
      selectionInitialized.current = true;
      return;
    }
    const first = query.data?.items[0];
    if (!tree.data || !first) return;
    const keyword = (params.get("q") ?? "").trim().toLocaleLowerCase("vi");
    const firstMatch = (query.data?.items ?? []).flatMap(root => [root, ...(root.children ?? [])])
      .find(category => (!status || status === category.status) && (!keyword || category.name.toLocaleLowerCase("vi").includes(keyword)));
    selectionInitialized.current = true;
    apply({ selected: (firstMatch ?? first).id }, { replace: true });
  }, [apply, creating, params, query.data, selectedParam, status, tree.data]);
  const selectedId = selected?.id;
  const { data: summary } = useQuery({
    queryKey: ["admin", "category-summary", selectedId],
    queryFn: ({ signal }) => apiForQuery(signal).admin.categorySummary(selectedId!),
    enabled: !!selectedId && !creating,
    retry: false,
  });
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [parentId, setParentId] = useState("");
  const [manualSlug, setManualSlug] = useState(false);
  const [confirmDisable, setConfirmDisable] = useState(false);
  const [icon, setIcon] = useState("");
  const [description, setDescription] = useState("");
  const [sortIndex, setSortIndex] = useState("0");
  const [acceptNew, setAcceptNew] = useState(true);
  const [showOnHome, setShowOnHome] = useState<boolean | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [alphabetical, setAlphabetical] = useState(false);

  useEffect(() => {
    const category = creating ? null : selected;
    setName(category?.name ?? "");
    setSlug(category?.slug ?? "");
    setParentId(category?.parent_id ?? "");
    setManualSlug(!!category);
    setIcon(category?.icon ?? "");
    setDescription(category?.description ?? "");
    setSortIndex(String(category?.sort_index ?? 0));
    setAcceptNew(category?.accept_new_listings ?? true);
    setShowOnHome(category?.show_on_home ?? null);
  }, [creating, selected]);

  const mutation = useMutation({
    mutationFn: async () => {
      const input = { name, slug, parent_id: parentId || null, icon: icon.trim() || null, description: description.trim() || null, sort_index: Number(sortIndex), accept_new_listings: acceptNew, show_on_home: showOnHome };
      if (creating) return api.admin.createCategory(input);
      if (!selected) throw new Error("Chưa chọn danh mục.");
      return api.admin.updateCategory(selected.id, input);
    },
    onSuccess: (category) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.categories });
      void invalidateAdminResources(queryClient, "categories", "audit");
      toast.success(creating ? "Đã tạo danh mục" : "Đã cập nhật danh mục");
      apply({ new: null, selected: category.id }, { replace: true });
    },
    onError: (error) => toast.error("Không thể lưu danh mục", { description: errorDescription(error) }),
  });

  const statusMutation = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("Chưa chọn danh mục.");
      return api.admin.updateCategory(selected.id, { status: selected.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" });
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: queryKeys.categories }); void invalidateAdminResources(queryClient, "categories", "audit");
      toast.success(selected?.status === "ACTIVE" ? "Đã vô hiệu danh mục" : "Đã kích hoạt danh mục"); setConfirmDisable(false); },
    onError: (error) => toast.error("Không thể đổi trạng thái danh mục", { description: errorDescription(error) }),
  });

  const roots = useMemo(() => {
    const items = query.data?.items ?? [];
    if (!alphabetical) return items;
    const byName = (a: CategoryNode, b: CategoryNode) => a.name.localeCompare(b.name, "vi");
    return [...items].sort(byName).map(root => ({ ...root, children: root.children && [...root.children].sort(byName) }));
  }, [query.data, alphabetical]);
  const parentOptions = useMemo(() => (tree.data ?? []).filter((root) => root.id !== selected?.id), [tree.data, selected]);
  const editorVisible = creating || selected !== null;

  const childCount = (tree.data ?? []).reduce((total, root) => total + (root.children?.length ?? 0), 0);
  const parentName = parentOptions.find(root => root.id === selected?.parent_id)?.name;
  const addCategory = () => apply({ new: "1", selected: null });
  const selectCategory = (id: string) => apply({ selected: id, new: null });

  function toggleRoot(id: string) {
    setCollapsed(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return <div className="admin-stack">
    <AdminHeading title="Danh mục" description="Quản lý cây danh mục tối đa hai cấp và trạng thái nhận tin đăng."
      actions={<button type="button" className="admin-utility admin-primary" onClick={addCategory}><Icon name="plus" size={18} />Thêm danh mục</button>} />
    <div className="admin-panel">
      <AdminToolbar className="admin-search-inline category-toolbar">
        <SearchInput value={search} onValueChange={setSearch} onSubmit={() => apply({ q: search.trim() || null })} label="Tìm danh mục" placeholder="Tìm tên danh mục" />
        <ToolbarField label="Trạng thái" htmlFor="category-status"><Select id="category-status" value={status} onChange={(event) => apply({ status: event.target.value || null })}><option value="">Tất cả</option><option value="ACTIVE">Hoạt động</option><option value="INACTIVE">Vô hiệu</option></Select></ToolbarField>
        <AdminAdvancedFilters fields={["handled_by", "from", "to"]}>
          <ToolbarField label="Người xử lý" htmlFor="category-handler"><Input id="category-handler" value={params.get("handled_by") ?? ""} onChange={(event) => apply({ handled_by: event.target.value || null })} placeholder="UUID quản trị viên" /></ToolbarField>
          <ToolbarField label="Thao tác từ ngày" htmlFor="category-from"><Input id="category-from" type="date" value={params.get("from") ?? ""} onChange={(event) => apply({ from: event.target.value || null })} /></ToolbarField>
          <ToolbarField label="Đến ngày" htmlFor="category-to"><Input id="category-to" type="date" value={params.get("to") ?? ""} onChange={(event) => apply({ to: event.target.value || null })} /></ToolbarField>
        </AdminAdvancedFilters>
      </AdminToolbar>
    </div>
    {tree.isError && <QueryErrorAlert error={tree.error} onRetry={() => tree.refetch()} />}
    {query.isError ? <QueryErrorAlert error={query.error} onRetry={() => query.refetch()} /> : <div className="category-layout">
      <div className="admin-panel category-tree">
        <div className="category-tree-head">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2"><h2>Cây danh mục</h2>{tree.data && <AdminPill tone="brand">{tree.data.length} nhóm chính</AdminPill>}</div>
            <p>Giữ cả danh mục cha và con để quản lý phân cấp dễ dàng.</p>
          </div>
          <div className="flex shrink-0 gap-1">
            {roots.some(root => root.children?.length) && <button type="button" className="admin-header-tool category-tree-tool" aria-label={roots.every(root => !root.children?.length || collapsed.has(root.id)) ? "Mở tất cả nhóm" : "Thu gọn tất cả nhóm"}
              onClick={() => setCollapsed(roots.every(root => !root.children?.length || collapsed.has(root.id)) ? new Set() : new Set(roots.map(root => root.id)))}><Icon name="unfold" size={18} /></button>}
            <button type="button" className="admin-header-tool category-tree-tool" aria-label="Sắp xếp theo tên" aria-pressed={alphabetical} onClick={() => setAlphabetical(value => !value)}><Icon name="sort" size={17} /></button>
          </div>
        </div>
        {query.isPending ? <div className="space-y-4 p-4" aria-busy="true" aria-label="Đang tải danh mục"><Skeleton h="38px" /><Skeleton h="38px" /><Skeleton h="38px" /></div> : roots.length === 0 ? <EmptyState title="Chưa có danh mục" action={{ label: "Thêm danh mục", onClick: addCategory }} /> : <ul className="category-tree-list">
          {roots.map(root => {
            const hasChildren = !!root.children?.length;
            const expanded = hasChildren && !collapsed.has(root.id);
            const childListId = "category-children-" + root.id;
            return <li key={root.id}>
              <div className="category-tree-root">
                {hasChildren && <button type="button" className="category-tree-toggle" aria-label={expanded ? "Thu gọn nhóm" : "Mở nhóm"} aria-controls={childListId} aria-expanded={expanded} onClick={() => toggleRoot(root.id)}>
                  <Icon name="chevron-right" size={15} className={expanded ? "rotate-90" : ""} />
                </button>}
                <button type="button" className="category-tree-item" aria-current={selected?.id === root.id || undefined} onClick={() => selectCategory(root.id)}>
                  <CategoryIcon slug={root.slug} symbol={root.icon} size={19} /><span>{root.name}</span><CategoryStatus category={root} selected={selected?.id === root.id} />
                </button>
              </div>
              {hasChildren && <ul id={childListId} hidden={!expanded} className="category-tree-children">
                {root.children?.map(child => <li key={child.id}>
                  <button type="button" className="category-tree-item" aria-current={selected?.id === child.id || undefined} onClick={() => selectCategory(child.id)}>
                    <CategoryIcon slug={child.slug} symbol={child.icon} size={17} /><span>{child.name}</span><CategoryStatus category={child} selected={selected?.id === child.id} />
                  </button>
                </li>)}
              </ul>}
            </li>;
          })}
        </ul>}
        {query.data && query.data.meta.total_pages > 1 && <Pagination page={query.data.meta.page} totalPages={query.data.meta.total_pages} total={query.data.meta.total} onPageChange={(next) => apply({ page: String(next) })} />}
        <div className="category-tree-footer">
          {tree.data && <span>Tổng cộng {childCount.toLocaleString("vi-VN")} danh mục phụ</span>}
          <button type="button" className="admin-inline-icon ml-auto text-brand" onClick={addCategory}><Icon name="plus" size={16} />Thêm mục cha</button>
        </div>
      </div>
      <div className="admin-panel category-editor">
        {!editorVisible ? <EmptyState title="Chọn một danh mục" description="Chọn bên trái để chỉnh sửa hoặc tạo danh mục mới." /> : <>
          <div className="category-editor-head">
            <span className="admin-heading-icon"><CategoryIcon slug={selected?.slug ?? ""} symbol={icon || "category"} size={25} /></span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2"><h2>{creating ? "Thêm danh mục" : selected?.name}</h2>{selected && <CategoryStatus category={selected} />}</div>
              {selected && <p>Cấp bậc: Cấp {selected.parent_id ? 2 : 1}{parentName && <> · Danh mục cha: <strong>{parentName}</strong></>}</p>}
            </div>
            {selected?.status === "ACTIVE" && <Link className="admin-utility shrink-0" to={"/products?category_id=" + encodeURIComponent(selected.id)}><Icon name="eye" size={17} />Xem trên web</Link>}
          </div>
          {selected && <AdminMetrics columns={3} metrics={[
            { label: "Sản phẩm đang bán", value: summary?.active_products, icon: "store" },
            { label: "Tin đăng chờ duyệt", value: summary?.pending_products, icon: "archive", tone: "warning" },
            { label: "Tổng giao dịch", value: summary?.completed_orders, icon: "cart", note: "30 ngày qua" },
          ]} />}
          <form className="category-form" onSubmit={(event) => { event.preventDefault(); mutation.mutate(); }}>
            <FormField label="Tên danh mục" htmlFor="category-name" required error={fieldError(mutation.error, "name")}><Input id="category-name" value={name} maxLength={100} onChange={(event) => { const value = event.target.value; setName(value); if (!manualSlug) setSlug(slugify(value)); }} /></FormField>
            <FormField label="Slug định danh (URL)" htmlFor="category-slug" required error={fieldError(mutation.error, "slug")}>
              <div className="relative"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true">/</span>
                <Input id="category-slug" className="pl-7" value={slug} maxLength={120} onChange={(event) => { setManualSlug(true); setSlug(event.target.value); }} />
              </div>
            </FormField>
            <FormField label="Danh mục cha" htmlFor="category-parent" error={fieldError(mutation.error, "parent_id")}><Select id="category-parent" value={parentId} disabled={Boolean(selected?.children?.length)} onChange={(event) => setParentId(event.target.value)}><option value="">Không có — danh mục cấp một</option>{parentOptions.map(root => <option key={root.id} value={root.id}>{root.name}</option>)}</Select></FormField>
            <FormField label="Icon Material Symbol" htmlFor="category-icon" error={fieldError(mutation.error, "icon")}><div className="relative">
              <Input id="category-icon" list="category-icons" value={icon} maxLength={64} className="pr-10" onChange={event => setIcon(event.target.value)} placeholder="category" />
              <CategoryIcon slug={selected?.slug ?? ""} symbol={icon || "category"} size={18} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-brand" />
              <datalist id="category-icons">{Object.keys(categorySymbols).map(symbol => <option key={symbol} value={symbol} />)}</datalist>
            </div></FormField>
            <FormField label="Thứ tự hiển thị (Sort index)" htmlFor="category-order" error={fieldError(mutation.error, "sort_index")}><Input id="category-order" type="number" min={0} max={99999} value={sortIndex} onChange={event => setSortIndex(event.target.value)} /></FormField>
            {selected && <FormField label="Trạng thái phát hành" htmlFor="category-editor-status"><Select id="category-editor-status" value={selected.status} disabled={statusMutation.isPending} onChange={() => selected.status === "ACTIVE" ? setConfirmDisable(true) : statusMutation.mutate()}><option value="ACTIVE">Hoạt động (Hiển thị đầy đủ)</option><option value="INACTIVE">Vô hiệu</option></Select></FormField>}
            <div className="category-form-wide"><FormField label="Mô tả ngắn danh mục" htmlFor="category-description" error={fieldError(mutation.error, "description")}><Textarea id="category-description" value={description} maxLength={1000} onChange={event => setDescription(event.target.value)} /></FormField></div>
            <div className="category-form-wide category-switches">
              <label className="category-switch"><span><strong>Nhận tin đăng mới</strong><small>Người bán có thể chọn danh mục này khi tạo tin đăng.</small></span><input type="checkbox" role="switch" checked={acceptNew} onChange={event => setAcceptNew(event.target.checked)} /></label>
              <label className="category-switch"><span><strong>Hiển thị trên Trang chủ Marketplace</strong><small>Ghim danh mục vào nhóm nổi bật ngoài trang chủ.</small></span><input type="checkbox" role="switch" checked={showOnHome ?? !parentId} onChange={event => setShowOnHome(event.target.checked)} /></label>
            </div>
            <div className="category-form-wide flex flex-wrap items-center justify-end gap-2">
              {selected && <Button variant="ghost" className="mr-auto" onClick={() => selected.status === "ACTIVE" ? setConfirmDisable(true) : statusMutation.mutate()} loading={statusMutation.isPending}>{selected.status === "ACTIVE" ? "Vô hiệu" : "Kích hoạt"}</Button>}
              <Button variant="ghost" onClick={() => apply({ selected: null, new: null })}>Hủy</Button>
              <Button type="submit" loading={mutation.isPending}>Lưu danh mục</Button>
            </div>
          </form>
        </>}
      </div>
    </div>}
    {selected && confirmDisable && <ConfirmDialog title={`Vô hiệu “${selected.name}”?`} description="Tin liên quan sẽ ngừng hiển thị hoặc mua mới; đơn chờ xác nhận có thể bị hủy và giải phóng hàng theo quy tắc hệ thống." confirmLabel="Vô hiệu danh mục" loading={statusMutation.isPending} onConfirm={() => statusMutation.mutate()} onCancel={() => setConfirmDisable(false)} />}
  </div>;
}
