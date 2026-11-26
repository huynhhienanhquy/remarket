import type { AdminUserItem, UserStatus } from "@remarket/shared";
import { USER_STATUS_LABELS, formatDate, formatDateTime } from "@remarket/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AdminDataTable as DataTable } from "../../components/admin/AdminDataTable/AdminDataTable";
import { AdminPagination } from "../../components/admin/AdminPagination/AdminPagination";
import { AdminHeading } from "../../components/admin/AdminHeading/AdminHeading";
import { AdminAvatar, AdminMetrics, AdminPill } from "../../components/admin/AdminSummary/AdminSummary";
import { AdminAdvancedFilters, AdminToolbar, ToolbarField } from "../../components/admin/AdminToolbar/AdminToolbar";
import { QueryErrorAlert } from "../../components/admin/QueryErrorAlert/QueryErrorAlert";
import { RowAction } from "../../components/admin/RowAction/RowAction";
import type { DataTableColumn } from "../../components/common/DataTable/DataTable";
import { Button } from "../../components/common/Button/Button";
import { ConfirmDialog, Dialog } from "../../components/common/Dialog/Dialog";
import { Drawer } from "../../components/common/Drawer/Drawer";
import { EmptyState } from "../../components/common/EmptyState/EmptyState";
import { Input, Select } from "../../components/common/Input/Input";
import { Icon } from "../../components/common/Icon/Icon";
import { SearchInput } from "../../components/common/SearchInput/SearchInput";
import { SectionCard } from "../../components/common/SectionCard/SectionCard";
import { StatusBadge } from "../../components/common/StatusBadge/StatusBadge";
import { useToast } from "../../components/common/Toast/Toast";
import { queryKeys } from "../../config/queryClient";
import { invalidateAdminResources, patchAdminRows } from "../../helpers/adminCache";
import { errorDescription } from "../../helpers/adminErrors";
import { useAdminParams } from "../../hooks/useAdminParams";
import { api, apiForQuery } from "../../services/api";
import { readEnumParam, readPage } from "../../utils/adminParams";
import { AdminUserProducts } from "./AdminUserProducts";
import { AdminCreateUserDialog } from "./sections/AdminCreateUserDialog";
import { formatAdminPercent, useAdminSummary } from "../../hooks/useAdminSummary";
import { exportAdminCsv } from "../../helpers/exportAdminCsv";

const USER_STATUSES = ["ACTIVE", "LOCKED"] as const;

function UserIdentity({ user }: { user: AdminUserItem }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <AdminAvatar name={user.full_name} src={user.avatar_url} tone={user.status === "LOCKED" ? "warning" : "outline"} />
      <div className="min-w-0">
        <p className="truncate t-label text-ink">{user.full_name}</p>
        <p className="truncate t-meta text-muted">{user.email}</p>
      </div>
    </div>
  );
}

export function AdminUsersPage() {
  const navigate = useNavigate();
  const { params, apply } = useAdminParams();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { data: summary } = useAdminSummary("users");
  const page = readPage(params);
  const status = readEnumParam(params, "status", USER_STATUSES);
  const role = readEnumParam(params, "role", ["USER", "ADMIN"] as const);
  const selectedId = params.get("selected");
  const [search, setSearch] = useState(params.get("q") ?? "");
  const [action, setAction] = useState<"lock" | "unlock" | null>(null);
  const [reason, setReason] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [quickActionsUser, setQuickActionsUser] = useState<AdminUserItem | null>(null);

  useEffect(() => setSearch(params.get("q") ?? ""), [params]);

  const queryInput = useMemo(() => ({
    ...(params.get("q") ? { q: params.get("q")! } : {}),
    ...(status ? { status: status as UserStatus } : {}),
    ...(role ? { role } : {}),
    ...(params.get("handled_by") ? { handled_by: params.get("handled_by")! } : {}),
    ...(params.get("from") ? { from: params.get("from")! } : {}),
    ...(params.get("to") ? { to: params.get("to")! } : {}),
    page,
  }), [params, status, role, page]);
  const query = useQuery({ queryKey: queryKeys.adminUsers(queryInput), queryFn: ({ signal }) => apiForQuery(signal).admin.users(queryInput) });
  const selectedQuery = useQuery({
    queryKey: queryKeys.adminUser(selectedId ?? ""),
    queryFn: ({ signal }) => apiForQuery(signal).admin.user(selectedId!),
    enabled: selectedId !== null,
  });
  const selected = selectedQuery.data ?? query.data?.items.find((user) => user.id === selectedId) ?? null;
  const systemChat = useMutation({
    mutationFn: (id: string) => api.admin.openSystemConversation(id),
    onSuccess: ({ conversation_id }) => {
      const query = new URLSearchParams({ return_to: `/admin/users?${params.toString()}` });
      navigate(`/messages/${conversation_id}?${query.toString()}`);
    },
    onError: (error) => toast.error("Không thể mở tin nhắn hệ thống", { description: errorDescription(error) }),
  });

  const mutation = useMutation({
    mutationFn: async () => {
      if (!selected || !action) throw new Error("Thiếu người dùng cần xử lý.");
      return action === "lock" ? api.admin.lockUser(selected.id, reason) : api.admin.unlockUser(selected.id);
    },
    onSuccess: (user) => {
      queryClient.setQueryData(queryKeys.adminUser(user.id), user);
      patchAdminRows(queryClient, "users", user);
      toast.success(action === "lock" ? "Đã khóa tài khoản" : "Đã mở khóa tài khoản");
      void invalidateAdminResources(queryClient, "users", "products", "tickets", "dashboard", "audit");
      setAction(null);
      setReason("");
    },
    onError: (error) => toast.error("Không thể cập nhật tài khoản", { description: errorDescription(error) }),
  });

  const columns: Array<DataTableColumn<AdminUserItem>> = [
    { key: "full_name", header: "Người dùng", render: (user) => <UserIdentity user={user} /> },
    { key: "role", header: "Vai trò", render: (user) => <AdminPill>{user.role === "ADMIN" ? "Quản trị viên" : "Người dùng"}</AdminPill>, hideOnMobile: true },
    { key: "status", header: "Trạng thái", render: (user) => { const meta = USER_STATUS_LABELS[user.status]; return <AdminPill tone={meta.tone} dot>{meta.label}</AdminPill>; } },
    { key: "created_at", header: "Ngày tham gia", render: (user) => <time dateTime={user.created_at}>{formatDate(user.created_at)}</time>, hideOnMobile: true },
    { key: "product_count", header: "Tin đăng", render: (user) => user.product_count === undefined ? "—" : user.product_count.toLocaleString("vi-VN") + " tin", hideOnMobile: true },
    { key: "rating", header: "Đánh giá", render: (user) => user.rating == null ? "—" : <span className="admin-inline-icon"><Icon name="star" size={14} className="text-accent" />{user.rating.toLocaleString("vi-VN", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</span>, hideOnMobile: true },
    { key: "id", header: "Thao tác", render: (user) => <div className="admin-cell-actions">
      <RowAction onClick={() => apply({ selected: user.id })}>Xem</RowAction>
      {user.role === "USER" && <RowAction className="admin-more" tone="muted" label={"Thao tác với " + user.full_name} onClick={() => setQuickActionsUser(user)}><Icon name="more-vertical" size={16} /></RowAction>}
    </div> },
  ];

  return (
    <div className="admin-stack">
      <AdminHeading title="Người dùng" description="Tìm kiếm và kiểm soát trạng thái tài khoản trên ReMarket."
        actions={<><button type="button" className="admin-utility" title="Xuất người dùng trên trang hiện tại" disabled={!query.data?.items.length} onClick={() => {
          exportAdminCsv("nguoi-dung.csv", ["Người dùng", "Email", "Vai trò", "Trạng thái", "Ngày tham gia"],
            (query.data?.items ?? []).map(row => [row.full_name, row.email, row.role, USER_STATUS_LABELS[row.status].label, row.created_at]));
        }}><Icon name="download" size={16} />Xuất dữ liệu</button>
        <button type="button" className="admin-utility admin-primary" onClick={() => setCreateOpen(true)}><span className="rm-button-content inline-flex items-center gap-2"><Icon name="users" size={17} />Thêm người dùng mới</span></button></>} />
      <AdminMetrics metrics={[
        { label: "Tổng tài khoản", value: summary?.total, icon: "users", note: "Tài khoản hiện tại" },
        { label: "Đang hoạt động", value: summary?.active, icon: "check", note: summary?.total ? `Chiếm ${formatAdminPercent(summary.active * 100 / summary.total)} tổng số` : "Đã xác minh email" },
        { label: "Chờ xác minh email", value: summary?.pending_email, icon: "mail-check", tone: "warning", note: "Chưa xác minh email" },
        { label: "Bị tạm khóa", value: summary?.locked, icon: "alert-triangle", tone: "danger", note: "Tài khoản bị hạn chế" },
      ]} />
      <div className="admin-panel">
          <AdminToolbar>
            <div className="admin-toolbar-search admin-labeled-search">
              <span aria-hidden="true">Tìm kiếm</span>
              <SearchInput value={search} onValueChange={setSearch} onSubmit={() => apply({ q: search.trim() || null })} placeholder="Tìm theo tên hoặc email" label="Tìm người dùng" />
            </div>
            <ToolbarField label="Trạng thái" htmlFor="user-status">
              <Select id="user-status" value={status} onChange={(event) => apply({ status: event.target.value || null })}>
                <option value="">Tất cả</option><option value="ACTIVE">Hoạt động</option><option value="LOCKED">Bị khóa</option>
              </Select>
            </ToolbarField>
            <ToolbarField label="Vai trò" htmlFor="user-role">
              <Select id="user-role" value={role} onChange={(event) => apply({ role: event.target.value || null })}>
                <option value="">Tất cả</option><option value="USER">Người dùng</option><option value="ADMIN">Quản trị viên</option>
              </Select>
            </ToolbarField>
            <button type="button" className="admin-utility" onClick={() => { setSearch(""); apply({ q: null, status: null, role: null, handled_by: null, from: null, to: null, page: null }); }}><Icon name="refresh" size={16} />Đặt lại</button>
            <AdminAdvancedFilters fields={["handled_by", "from", "to"]} summary={`Đang áp dụng ${["q", "status", "role", "handled_by", "from", "to"].filter(field => params.has(field)).length} điều kiện lọc`}>
            <ToolbarField label="Từ ngày" htmlFor="user-from"><Input id="user-from" type="date" value={params.get("from") ?? ""} onChange={(event) => apply({ from: event.target.value || null })} /></ToolbarField>
            <ToolbarField label="Người xử lý" htmlFor="user-handler"><Input id="user-handler" value={params.get("handled_by") ?? ""} onChange={(event) => apply({ handled_by: event.target.value || null })} placeholder="UUID quản trị viên" /></ToolbarField>
            <ToolbarField label="Đến ngày" htmlFor="user-to"><Input id="user-to" type="date" value={params.get("to") ?? ""} onChange={(event) => apply({ to: event.target.value || null })} /></ToolbarField></AdminAdvancedFilters>
          </AdminToolbar>
      </div>
      {query.isError && <QueryErrorAlert error={query.error} onRetry={() => query.refetch()} />}
      {!query.isError && <SectionCard className="admin-table-panel" bodyClassName="p-0 lg:p-0">
        {!query.isError && <DataTable columns={columns} rows={query.data?.items ?? []} rowKey={(row) => row.id} loading={query.isPending} onRowClick={(row) => apply({ selected: row.id })} empty={<EmptyState title="Không có người dùng phù hợp" description="Hãy thay đổi từ khóa hoặc bộ lọc." />} />}
        {query.data && <AdminPagination meta={query.data.meta} shown={query.data.items.length} resource="người dùng" showArrows={false} onPageChange={(next) => apply({ page: String(next) })} />}
      </SectionCard>}

      {createOpen && <AdminCreateUserDialog onClose={() => setCreateOpen(false)} />}
      {quickActionsUser && <Dialog open onClose={() => setQuickActionsUser(null)} title={quickActionsUser.full_name}>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => { apply({ selected: quickActionsUser.id }); setQuickActionsUser(null); }}>Xem chi tiết</Button>
          <Button variant={quickActionsUser.status === "ACTIVE" ? "danger" : "secondary"} onClick={() => {
            apply({ selected: quickActionsUser.id });
            setAction(quickActionsUser.status === "ACTIVE" ? "lock" : "unlock");
            setQuickActionsUser(null);
          }}>{quickActionsUser.status === "ACTIVE" ? "Khóa tài khoản" : "Mở khóa tài khoản"}</Button>
        </div>
      </Dialog>}
      <Drawer open={selectedId !== null} onClose={() => apply({ selected: null }, { replace: true })} title="Chi tiết người dùng" footer={selected?.role === "USER" ? <button type="button" className={selected.status === "ACTIVE" ? "rm-button-danger min-h-[44px] rounded-control bg-danger px-4 t-label text-white" : "rm-button-primary min-h-[44px] rounded-control bg-brand px-4 t-label text-white"} onClick={() => setAction(selected.status === "ACTIVE" ? "lock" : "unlock")}><span className="rm-button-content inline-block">{selected.status === "ACTIVE" ? "Khóa tài khoản" : "Mở khóa tài khoản"}</span></button> : undefined}>
        {selectedQuery.isPending ? <p className="t-body text-muted">Đang tải người dùng…</p> : selectedQuery.isError ? <QueryErrorAlert error={selectedQuery.error} onRetry={() => selectedQuery.refetch()} /> : selected && <div className="space-y-6">
          <UserIdentity user={selected} />
          {selected.role === "USER" && <div className="space-y-2">
            <Button loading={systemChat.isPending} disabled={selected.status !== "ACTIVE"} onClick={() => systemChat.mutate(selected.id)}>Nhắn tin hệ thống</Button>
            <p className="t-meta text-muted">{selected.status === "ACTIVE" ? "Người nhận sẽ thấy tin nhắn từ Hệ thống ReMarket." : "Tài khoản đang bị khóa nên chưa thể nhận tin nhắn mới."}</p>
          </div>}
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div><dt className="t-meta text-muted">Vai trò</dt><dd className="mt-1 t-body text-ink">{selected.role === "ADMIN" ? "Quản trị viên" : "Người dùng"}</dd></div>
            <div><dt className="t-meta text-muted">Trạng thái</dt><dd className="mt-1"><StatusBadge label={USER_STATUS_LABELS[selected.status].label} tone={USER_STATUS_LABELS[selected.status].tone} /></dd></div>
            <div><dt className="t-meta text-muted">Ngày tham gia</dt><dd className="mt-1 t-body text-ink">{formatDateTime(selected.created_at)}</dd></div>
            <div><dt className="t-meta text-muted">Mã người dùng</dt><dd className="mt-1 break-all t-meta text-ink">{selected.id}</dd></div>
            <div><dt className="t-meta text-muted">Số điện thoại</dt><dd className="mt-1 t-body text-ink">{selected.phone ?? "Chưa cung cấp"}</dd></div>
            <div><dt className="t-meta text-muted">Khu vực</dt><dd className="mt-1 t-body text-ink">{selected.province_label ?? selected.province_code ?? "Chưa cung cấp"}</dd></div>
            <div className="sm:col-span-2"><dt className="t-meta text-muted">Địa chỉ mặc định</dt><dd className="mt-1 t-body text-ink">{selected.default_address ?? "Chưa cung cấp"}</dd></div>
            <div><dt className="t-meta text-muted">Xác minh email</dt><dd className="mt-1 t-body text-ink">{selected.email_verified_at ? formatDateTime(selected.email_verified_at) : "Chưa xác minh"}</dd></div>
          </dl>
          {selected.status === "LOCKED" && <div className="rounded-card bg-danger-bg p-4"><p className="t-label text-danger">Lý do khóa</p><p className="mt-1 t-body text-ink">{selected.lock_reason ?? "Không có lý do"}</p><p className="mt-2 t-meta text-muted">Thời gian: {formatDateTime(selected.locked_at)}</p></div>}
          <AdminUserProducts key={selected.id} userId={selected.id} />
        </div>}
      </Drawer>

      {selected && action && <ConfirmDialog title={action === "lock" ? `Khóa ${selected.full_name}?` : `Mở khóa ${selected.full_name}?`} description={action === "lock" ? "Các đơn chưa giao liên quan có thể bị hủy theo quy tắc hệ thống; đơn đã giao cần xử lý hỗ trợ." : "Người dùng sẽ có thể đăng nhập và tiếp tục sử dụng các quyền phù hợp."} confirmLabel={action === "lock" ? "Khóa tài khoản" : "Mở khóa"} tone={action === "lock" ? "danger" : "primary"} loading={mutation.isPending} onCancel={() => { setAction(null); setReason(""); }} onConfirm={() => mutation.mutate()} reasonField={action === "lock" ? { label: "Lý do khóa", required: true, value: reason, onChange: setReason, placeholder: "Nêu rõ lý do và căn cứ xử lý" } : undefined} />}
    </div>
  );
}
