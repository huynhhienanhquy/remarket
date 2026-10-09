import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AdminProductItem, CategoryNode, ProductStatus } from "@remarket/shared";
import { CONDITION_LABELS, DELIVERY_LABELS, PRODUCT_STATUS_LABELS, formatDateTime, formatVnd } from "@remarket/shared";
import { api } from "../../services/api";
import { isApiError } from "../../helpers/errors";
import { queryKeys } from "../../config/queryClient";
import { ApiImage, ConfirmDialog, Drawer, EmptyState, Input, Pagination, SearchInput, SectionCard, Select, StatusBadge, Tabs, useToast } from "../../components/common";
import type { DataTableColumn } from "../../components/common";
import { AdminDataTable as DataTable } from "../../components/admin/AdminDataTable/AdminDataTable";
import { AdminHeading } from "../../components/admin/AdminHeading/AdminHeading";
import { AdminAdvancedFilters, AdminToolbar, ToolbarField } from "../../components/admin/AdminToolbar/AdminToolbar";
import { QueryErrorAlert } from "../../components/admin/QueryErrorAlert/QueryErrorAlert";
import { RowAction } from "../../components/admin/RowAction/RowAction";
import { errorDescription, isVersionConflict } from "../../helpers/adminErrors";
import { readPage } from "../../utils/adminParams";
import { useAdminParams } from "../../hooks/useAdminParams";

const TABS = [
  { value: "PENDING", label: "Chờ duyệt" },
  { value: "ACTIVE", label: "Đang bán" },
  { value: "REJECTED", label: "Bị từ chối" },
  { value: "RESERVED", label: "Đang được giữ" },
  { value: "SOLD", label: "Đã bán" },
  { value: "INACTIVE", label: "Đã ẩn" },
  { value: "BLOCKED", label: "Bị hạn chế" },
  { value: "ALL", label: "Tất cả" },
];

function flattenCategories(nodes: CategoryNode[]): CategoryNode[] {
  return nodes.flatMap((node) => [node, ...(node.children ?? [])]);
}

function ProductStatusView({ product }: { product: AdminProductItem }) {
  const meta = PRODUCT_STATUS_LABELS[product.status];
  return <div className="flex flex-wrap gap-1"><StatusBadge label={meta.label} tone={meta.tone} size="sm" />{product.is_blocked && <StatusBadge label="Bị hạn chế" tone="danger" size="sm" />}</div>;
}

export function AdminProductsPage() {
  const { params, apply } = useAdminParams();
  const queryClient = useQueryClient();
  const toast = useToast();
  const page = readPage(params);
  const tab = TABS.some((item) => item.value === params.get("status")) ? params.get("status")! : "PENDING";
  const selectedId = params.get("selected");
  const [search, setSearch] = useState(params.get("q") ?? "");
  const [action, setAction] = useState<"approve" | "reject" | "block" | "unblock" | null>(null);
  const [reason, setReason] = useState("");
  useEffect(() => setSearch(params.get("q") ?? ""), [params]);

  const categories = useQuery({ queryKey: queryKeys.adminCategoryTree, queryFn: () => api.admin.categoryTree() });
  const allCategories = useMemo(() => flattenCategories(categories.data ?? []), [categories.data]);
  const queryInput = useMemo(() => ({
    ...(tab !== "ALL" ? { status: tab as ProductStatus | "BLOCKED" } : {}),
    ...(params.get("category_id") ? { category_id: params.get("category_id")! } : {}),
    ...(params.get("q") ? { q: params.get("q")! } : {}),
    ...(params.get("seller_id") ? { seller_id: params.get("seller_id")! } : {}),
    ...(params.get("handled_by") ? { handled_by: params.get("handled_by")! } : {}),
    ...(params.get("from") ? { from: params.get("from")! } : {}),
    ...(params.get("to") ? { to: params.get("to")! } : {}),
    page,
  }), [tab, params, page]);
  const query = useQuery({ queryKey: queryKeys.adminProducts(queryInput), queryFn: () => api.admin.products(queryInput) });
  const selected = query.data?.items.find((product) => product.id === selectedId) ?? null;

  const mutation = useMutation({
    mutationFn: async () => {
      if (!selected || !action) throw new Error("Thiếu tin đăng cần xử lý.");
      if (action === "approve") return api.admin.approveProduct(selected.id, selected.version);
      if (action === "reject") return api.admin.rejectProduct(selected.id, selected.version, reason);
      if (action === "block") return api.admin.blockProduct(selected.id, selected.version, reason);
      return api.admin.unblockProduct(selected.id, selected.version);
    },
    onSuccess: (product) => {
      queryClient.setQueriesData<{ items: AdminProductItem[]; meta: unknown }>({ queryKey: ["admin", "products"] }, (current) => current ? { ...current, items: current.items.map((item) => item.id === product.id ? product : item) } : current);
      void queryClient.invalidateQueries({ queryKey: ["admin", "dashboard"] });
      void queryClient.invalidateQueries({ queryKey: ["admin","products"] });
      void queryClient.invalidateQueries({ queryKey: ["admin","tickets"] });
      void queryClient.invalidateQueries({ queryKey: ["admin","audit"] });
      toast.success(action === "approve" ? "Đã duyệt tin" : action === "reject" ? "Đã từ chối tin" : action === "block" ? "Đã hạn chế tin" : "Đã gỡ hạn chế");
      setAction(null); setReason("");
    },
    onError: (error) => {
      if (isVersionConflict(error) || (isApiError(error) && error.is("INVALID_ORDER_TRANSITION"))) {
        toast.error("Tin đăng đã thay đổi", { description: "Danh sách đang được tải lại. Hãy xem bản mới nhất trước khi duyệt." });
        setAction(null); setReason(""); void query.refetch();
      } else toast.error("Không thể xử lý tin đăng", { description: errorDescription(error) });
    },
  });

  const columns: Array<DataTableColumn<AdminProductItem>> = [
    { key: "title", header: "Tin đăng", render: (product) => <div className="flex min-w-[260px] items-center gap-3">{product.image_url ? <ApiImage src={product.image_url} alt="" className="h-12 w-16 shrink-0 rounded-xl object-cover" /> : <div className="h-12 w-16 shrink-0 rounded-xl bg-surface-subtle" />}<div><p className="line-clamp-2 t-label text-ink">{product.title}</p><p className="t-meta text-brand">{formatVnd(product.price)}</p></div></div> },
    { key: "seller", header: "Người bán", render: (product) => product.seller.name, hideOnMobile: true },
    { key: "category_name", header: "Danh mục", hideOnMobile: true },
    { key: "status", header: "Trạng thái", render: (product) => <ProductStatusView product={product} /> },
    { key: "updated_at", header: "Cập nhật", render: (product) => formatDateTime(product.updated_at), hideOnMobile: true },
    { key: "id", header: "Thao tác", render: (product) => <RowAction onClick={() => apply({ selected: product.id })}>Xem xét</RowAction> },
  ];

  const footer = selected ? <>
    {selected.is_blocked ? <button type="button" className="min-h-[44px] rounded-control border border-brand px-4 t-label text-brand" onClick={() => setAction("unblock")}>Gỡ hạn chế</button> : <button type="button" className="min-h-[44px] rounded-control border border-danger px-4 t-label text-danger" onClick={() => setAction("block")}>Hạn chế tin</button>}
    {selected.status === "PENDING" && !selected.is_blocked && <><button type="button" className="min-h-[44px] rounded-control border border-danger px-4 t-label text-danger" onClick={() => setAction("reject")}>Từ chối</button><button type="button" className="min-h-[44px] rounded-control bg-brand px-4 t-label text-white" onClick={() => setAction("approve")}>Duyệt tin</button></>}
  </> : undefined;

  return <div>
    <AdminHeading title="Sản phẩm và kiểm duyệt" description="Xem đúng phiên bản tin, duyệt nội dung và áp dụng hạn chế khi cần." />
    <SectionCard bodyClassName="p-0 lg:p-0">
      <Tabs tabs={TABS} value={tab} onChange={(value) => apply({ status: value === "PENDING" ? null : value })} ariaLabel="Trạng thái tin đăng" />
      <div className="p-4 lg:p-6"><AdminToolbar>
        <SearchInput value={search} onValueChange={setSearch} onSubmit={() => apply({ q: search.trim() || null })} placeholder="Tìm theo tiêu đề" label="Tìm tin đăng" className="sm:max-w-sm" />
        <ToolbarField label="Danh mục" htmlFor="product-category"><Select id="product-category" value={params.get("category_id") ?? ""} onChange={(event) => apply({ category_id: event.target.value || null })}><option value="">Tất cả danh mục</option>{allCategories.map((category) => <option key={category.id} value={category.id}>{category.parent_id ? "— " : ""}{category.name}</option>)}</Select></ToolbarField>
<AdminAdvancedFilters fields={["seller_id", "handled_by", "from", "to"]}>
        <ToolbarField label="Mã người bán" htmlFor="product-seller"><Input id="product-seller" value={params.get("seller_id") ?? ""} onChange={(event) => apply({ seller_id: event.target.value || null })} placeholder="UUID người bán" /></ToolbarField>
        <ToolbarField label="Người xử lý" htmlFor="product-handler"><Input id="product-handler" value={params.get("handled_by") ?? ""} onChange={(event) => apply({ handled_by: event.target.value || null })} placeholder="UUID quản trị viên" /></ToolbarField>
        <ToolbarField label="Từ ngày" htmlFor="product-from"><Input id="product-from" type="date" value={params.get("from") ?? ""} onChange={(event) => apply({ from: event.target.value || null })} /></ToolbarField>
        <ToolbarField label="Đến ngày" htmlFor="product-to"><Input id="product-to" type="date" value={params.get("to") ?? ""} onChange={(event) => apply({ to: event.target.value || null })} /></ToolbarField></AdminAdvancedFilters>
      </AdminToolbar>{query.isError && <QueryErrorAlert error={query.error} onRetry={() => query.refetch()} />}</div>
      {!query.isError && <DataTable columns={columns} rows={query.data?.items ?? []} rowKey={(row) => row.id} loading={query.isPending} onRowClick={(row) => apply({ selected: row.id })} empty={<EmptyState title="Không có tin đăng trong hàng đợi" description="Hãy chọn trạng thái hoặc bộ lọc khác." />} />}
      {query.data && <Pagination className="p-4 lg:px-6" page={query.data.meta.page} totalPages={query.data.meta.total_pages} total={query.data.meta.total} onPageChange={(next) => apply({ page: String(next) })} />}
    </SectionCard>

    <Drawer open={selected !== null} onClose={() => apply({ selected: null }, { replace: true })} title="Xem xét tin đăng" widthClassName="max-w-[760px]" footer={footer}>
      {selected && <div className="grid gap-6 md:grid-cols-[45%_1fr]">
        <div className="space-y-3">{selected.images.length > 0 ? selected.images.map((image, index) => <ApiImage key={image.id} src={image.url} alt={`${selected.title} — ảnh ${index + 1}`} className="w-full rounded-card border border-line object-cover" />) : <div className="aspect-[4/3] rounded-card bg-surface-subtle" />}</div>
        <div className="space-y-5"><div><ProductStatusView product={selected} /><h2 className="mt-3 t-h2 text-ink">{selected.title}</h2><p className="mt-1 text-xl font-semibold text-brand">{formatVnd(selected.price)}</p></div>
          <dl className="grid grid-cols-2 gap-4 t-body"><div><dt className="t-meta text-muted">Người bán</dt><dd>{selected.seller.name}</dd></div><div><dt className="t-meta text-muted">Danh mục</dt><dd>{selected.category_name}</dd></div><div><dt className="t-meta text-muted">Tình trạng</dt><dd>{CONDITION_LABELS[selected.condition]}</dd></div><div><dt className="t-meta text-muted">Giao nhận</dt><dd>{DELIVERY_LABELS[selected.delivery_method]}</dd></div><div><dt className="t-meta text-muted">Đã dùng</dt><dd>{selected.usage_months === null ? "Không cung cấp" : `${selected.usage_months} tháng`}</dd></div><div><dt className="t-meta text-muted">Phí ship</dt><dd>{formatVnd(selected.shipping_fee)}</dd></div></dl>
          <div><p className="t-label text-ink">Mô tả</p><p className="mt-2 whitespace-pre-wrap t-body text-ink">{selected.description}</p></div>
          {(selected.rejection_reason || selected.block_reason) && <div className="rounded-card bg-danger-bg p-4"><p className="t-label text-danger">Lý do kiểm duyệt</p><p className="mt-1 t-body">{selected.block_reason ?? selected.rejection_reason}</p></div>}
          <div className="border-t border-line pt-4 t-meta text-muted"><p>Phiên bản đang xem: v{selected.version}</p><p>Cập nhật: {formatDateTime(selected.updated_at)}</p><p className="break-all">ID: {selected.id}</p></div>
        </div>
      </div>}
    </Drawer>

    {selected && action && <ConfirmDialog title={action === "approve" ? "Duyệt tin đăng?" : action === "reject" ? "Từ chối tin đăng?" : action === "block" ? "Hạn chế tin đăng?" : "Gỡ hạn chế tin đăng?"} description={action === "unblock" ? "Gỡ hạn chế không tự đăng lại tin. Người bán phải gửi duyệt lại nếu món chưa bán." : action === "approve" ? `Bạn đang duyệt phiên bản v${selected.version}.` : undefined} confirmLabel={action === "approve" ? "Duyệt tin" : action === "reject" ? "Từ chối" : action === "block" ? "Hạn chế tin" : "Gỡ hạn chế"} tone={action === "approve" || action === "unblock" ? "primary" : "danger"} loading={mutation.isPending} onConfirm={() => mutation.mutate()} onCancel={() => { setAction(null); setReason(""); }} reasonField={action === "reject" || action === "block" ? { label: action === "reject" ? "Lý do từ chối" : "Lý do hạn chế", required: true, value: reason, onChange: setReason, placeholder: "Nêu rõ lý do để người bán hiểu cách xử lý" } : undefined} />}
  </div>;
}
