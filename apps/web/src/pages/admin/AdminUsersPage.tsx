import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AdminUserItem, UserStatus } from "@remarket/shared";
import { USER_STATUS_LABELS, formatDate, formatDateTime } from "@remarket/shared";
import { api } from "../../lib/api";
import { queryKeys } from "../../lib/queryClient";
import {
  ConfirmDialog,
  ApiImage,
  DataTable,
  Drawer,
  EmptyState,
  Input,
  Pagination,
  SearchInput,
  SectionCard,
  Select,
  StatusBadge,
  useToast,
} from "../../components/ui";
import type { DataTableColumn } from "../../components/ui";
import {
  AdminHeading,
  AdminToolbar,
  QueryErrorAlert,
  RowAction,
  ToolbarField,
  errorDescription,
  readEnumParam,
  readPage,
  useAdminParams,
} from "./adminShared";

const USER_STATUSES = ["ACTIVE", "LOCKED"] as const;

function UserIdentity({ user }: { user: AdminUserItem }) {
  return (
    <div className="flex min-w-[220px] items-center gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-soft t-label text-brand">
        {user.avatar_url ? <ApiImage src={user.avatar_url} alt="" className="h-full w-full object-cover" /> : user.full_name.slice(0, 1).toUpperCase()}
      </div>
      <div className="min-w-0">
        <p className="truncate t-label text-ink">{user.full_name}</p>
        <p className="truncate t-meta text-muted">{user.email}</p>
      </div>
    </div>
  );
}

export function AdminUsersPage() {
  const { params, apply } = useAdminParams();
  const queryClient = useQueryClient();
  const toast = useToast();
  const page = readPage(params);
  const status = readEnumParam(params, "status", USER_STATUSES);
  const role = readEnumParam(params, "role", ["USER", "ADMIN"] as const);
  const selectedId = params.get("selected");
  const [search, setSearch] = useState(params.get("q") ?? "");
  const [action, setAction] = useState<"lock" | "unlock" | null>(null);
  const [reason, setReason] = useState("");

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
  const query = useQuery({ queryKey: queryKeys.adminUsers(queryInput), queryFn: () => api.admin.users(queryInput) });
  const selectedQuery = useQuery({
    queryKey: queryKeys.adminUser(selectedId ?? ""),
    queryFn: () => api.admin.user(selectedId!),
    enabled: selectedId !== null,
  });
  const selected = selectedQuery.data ?? query.data?.items.find((user) => user.id === selectedId) ?? null;

  const mutation = useMutation({
    mutationFn: async () => {
      if (!selected || !action) throw new Error("Thiếu người dùng cần xử lý.");
      return action === "lock" ? api.admin.lockUser(selected.id, reason) : api.admin.unlockUser(selected.id);
    },
    onSuccess: (user) => {
      queryClient.setQueryData(queryKeys.adminUser(user.id), user);
      queryClient.setQueriesData<{ items: AdminUserItem[]; meta: unknown }>({ queryKey: ["admin", "users", "list"] }, (current) =>
        current ? { ...current, items: current.items.map((item) => item.id === user.id ? user : item) } : current,
      );
      toast.success(action === "lock" ? "Đã khóa tài khoản" : "Đã mở khóa tài khoản");
      void queryClient.invalidateQueries({ queryKey: ["admin","users","list"] });
      void queryClient.invalidateQueries({ queryKey: ["admin","products"] });
      void queryClient.invalidateQueries({ queryKey: ["admin","tickets"] });
      void queryClient.invalidateQueries({ queryKey: ["admin","dashboard"] });
      void queryClient.invalidateQueries({ queryKey: ["admin","audit"] });
      setAction(null);
      setReason("");
    },
    onError: (error) => toast.error("Không thể cập nhật tài khoản", { description: errorDescription(error) }),
  });

  const columns: Array<DataTableColumn<AdminUserItem>> = [
    { key: "full_name", header: "Người dùng", render: (user) => <UserIdentity user={user} /> },
    { key: "role", header: "Vai trò", render: (user) => user.role === "ADMIN" ? "Quản trị viên" : "Người dùng", hideOnMobile: true },
    { key: "status", header: "Trạng thái", render: (user) => { const meta = USER_STATUS_LABELS[user.status]; return <StatusBadge label={meta.label} tone={meta.tone} size="sm" />; } },
    { key: "created_at", header: "Ngày tham gia", render: (user) => formatDate(user.created_at), hideOnMobile: true },
    { key: "id", header: "Thao tác", render: (user) => <RowAction onClick={() => apply({ selected: user.id })}>Xem</RowAction> },
  ];

  return (
    <div>
      <AdminHeading title="Người dùng" description="Tìm kiếm và kiểm soát trạng thái tài khoản trên ReMarket." />
      <SectionCard bodyClassName="p-0 lg:p-0">
        <div className="p-4 lg:p-6">
          <AdminToolbar>
            <SearchInput value={search} onValueChange={setSearch} onSubmit={() => apply({ q: search.trim() || null })} placeholder="Tìm theo tên hoặc email" label="Tìm người dùng" className="sm:max-w-sm" />
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
            <ToolbarField label="Từ ngày" htmlFor="user-from"><Input id="user-from" type="date" value={params.get("from") ?? ""} onChange={(event) => apply({ from: event.target.value || null })} /></ToolbarField>
            <ToolbarField label="Người xử lý" htmlFor="user-handler"><Input id="user-handler" value={params.get("handled_by") ?? ""} onChange={(event) => apply({ handled_by: event.target.value || null })} placeholder="UUID quản trị viên" /></ToolbarField>
            <ToolbarField label="Đến ngày" htmlFor="user-to"><Input id="user-to" type="date" value={params.get("to") ?? ""} onChange={(event) => apply({ to: event.target.value || null })} /></ToolbarField>
          </AdminToolbar>
          {query.isError ? <QueryErrorAlert error={query.error} onRetry={() => query.refetch()} /> : null}
        </div>
        {!query.isError && <DataTable columns={columns} rows={query.data?.items ?? []} rowKey={(row) => row.id} loading={query.isPending} onRowClick={(row) => apply({ selected: row.id })} empty={<EmptyState title="Không có người dùng phù hợp" description="Hãy thay đổi từ khóa hoặc bộ lọc." />} />}
        {query.data && <Pagination className="p-4 lg:px-6" page={query.data.meta.page} totalPages={query.data.meta.total_pages} total={query.data.meta.total} onPageChange={(next) => apply({ page: String(next) })} />}
      </SectionCard>

      <Drawer open={selectedId !== null} onClose={() => apply({ selected: null }, { replace: true })} title="Chi tiết người dùng" footer={selected?.role === "USER" ? <button type="button" className={selected.status === "ACTIVE" ? "min-h-[44px] rounded-control bg-danger px-4 t-label text-white" : "min-h-[44px] rounded-control bg-brand px-4 t-label text-white"} onClick={() => setAction(selected.status === "ACTIVE" ? "lock" : "unlock")}>{selected.status === "ACTIVE" ? "Khóa tài khoản" : "Mở khóa tài khoản"}</button> : undefined}>
        {selectedQuery.isPending ? <p className="t-body text-muted">Đang tải người dùng…</p> : selectedQuery.isError ? <QueryErrorAlert error={selectedQuery.error} onRetry={() => selectedQuery.refetch()} /> : selected && <div className="space-y-6">
          <UserIdentity user={selected} />
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
        </div>}
      </Drawer>

      {selected && action && <ConfirmDialog title={action === "lock" ? `Khóa ${selected.full_name}?` : `Mở khóa ${selected.full_name}?`} description={action === "lock" ? "Các đơn chưa giao liên quan có thể bị hủy theo quy tắc hệ thống; đơn đã giao cần xử lý hỗ trợ." : "Người dùng sẽ có thể đăng nhập và tiếp tục sử dụng các quyền phù hợp."} confirmLabel={action === "lock" ? "Khóa tài khoản" : "Mở khóa"} tone={action === "lock" ? "danger" : "primary"} loading={mutation.isPending} onCancel={() => { setAction(null); setReason(""); }} onConfirm={() => mutation.mutate()} reasonField={action === "lock" ? { label: "Lý do khóa", required: true, value: reason, onChange: setReason, placeholder: "Nêu rõ lý do và căn cứ xử lý" } : undefined} />}
    </div>
  );
}
