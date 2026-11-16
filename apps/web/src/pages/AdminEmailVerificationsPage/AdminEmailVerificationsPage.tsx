import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDateTime, type EmailVerificationRequest } from "@remarket/shared";
import { api, apiForQuery } from "../../services/api";
import { queryKeys } from "../../config/queryClient";
import { ConfirmDialog, Dialog } from "../../components/common/Dialog/Dialog";
import { EmptyState } from "../../components/common/EmptyState/EmptyState";
import { Icon } from "../../components/common/Icon/Icon";
import { SearchInput } from "../../components/common/SearchInput/SearchInput";
import { SectionCard } from "../../components/common/SectionCard/SectionCard";
import { Select } from "../../components/common/Input/Input";
import { StatusBadge } from "../../components/common/StatusBadge/StatusBadge";
import { useToast } from "../../components/common/Toast/Toast";
import type { DataTableColumn } from "../../components/common/DataTable/DataTable";
import { OfflineNotice, QueryFailure } from "../../components/common/PageFeedback/PageFeedback";
import { useConnectivity } from "../../hooks/useConnectivity";
import { AdminDataTable as DataTable } from "../../components/admin/AdminDataTable/AdminDataTable";
import { AdminPagination } from "../../components/admin/AdminPagination/AdminPagination";
import { AdminHeading } from "../../components/admin/AdminHeading/AdminHeading";
import { AdminAvatar, AdminMetrics, AdminNotice, AdminPill } from "../../components/admin/AdminSummary/AdminSummary";
import { AdminToolbar, ToolbarField } from "../../components/admin/AdminToolbar/AdminToolbar";
import { RowAction } from "../../components/admin/RowAction/RowAction";
import { readEnumParam, readPage } from "../../utils/adminParams";
import { useAdminParams } from "../../hooks/useAdminParams";
import { formatAdminPercent, useAdminQueueCounts, useAdminSummary } from "../../hooks/useAdminSummary";

export function AdminEmailVerificationsPage() {
  const { params, apply } = useAdminParams();
  const status = readEnumParam(params, "status", ["PENDING", "APPROVED", "ALL"] as const) || "PENDING";
  const page = readPage(params);
  const client = useQueryClient();
  const toast = useToast();
  const online = useConnectivity();
  const [selected, setSelected] = useState<EmailVerificationRequest | null>(null);
  const [details, setDetails] = useState<EmailVerificationRequest | null>(null);
  const pending = useAdminQueueCounts()?.pending_email_verifications;
  const { data: summary } = useAdminSummary("email");
  const keyword = params.get("q") ?? "";
  const [search, setSearch] = useState(keyword);
  useEffect(() => setSearch(keyword), [keyword]);
  const filters = { status, page, ...(keyword ? { q: keyword } : {}) };
  const query = useQuery({ queryKey: queryKeys.adminEmailVerifications(filters), queryFn: ({ signal }) => apiForQuery(signal).admin.emailVerifications(filters), refetchInterval: 15000 });
  const approve = useMutation({
    mutationFn: (id: string) => api.admin.approveEmailVerification(id),
    onSuccess: () => {
      toast.success("Đã xác minh email"); setSelected(null);
      if (status === "PENDING" && query.data?.items.length === 1 && page > 1) apply({ page: String(page - 1) }, { replace: true });
      for (const key of ["admin", "notifications", "email-verification"]) void client.invalidateQueries({ queryKey: [key] });
    },
  });
  const columns: DataTableColumn<EmailVerificationRequest>[] = [
    { key: "user", header: "Người dùng", width: "25%", render: (item) => <div className="flex items-center gap-3"><AdminAvatar name={item.user.full_name} /><div className="min-w-0"><p className="t-label text-ink break-words">{item.user.full_name}</p><p className="t-meta text-muted break-all">{item.user.email}</p></div></div> },
    { key: "requested_at", header: "Ngày gửi", render: (item) => <time dateTime={item.requested_at}>{formatDateTime(item.requested_at)}</time>, hideOnMobile: true },
    { key: "status", header: "Trạng thái", render: (item) => <div className="space-y-1"><AdminPill tone={item.status === "PENDING" ? "warning" : "brand"}>{item.status === "PENDING" ? "Chờ duyệt" : "Đã xác minh"}</AdminPill>{item.user.status === "LOCKED" && <StatusBadge label="Tài khoản bị khóa" tone="danger" size="sm" />}</div> },
    { key: "approved_at", header: "Ngày duyệt", render: (item) => item.approved_at ? <time dateTime={item.approved_at}>{formatDateTime(item.approved_at)}</time> : "—", hideOnMobile: true },
    { key: "id", header: "Thao tác", render: (item) => <div className="admin-cell-actions">
      {item.status === "PENDING" && <RowAction className="admin-approve-email" disabled={!online || approve.isPending} onClick={() => { approve.reset(); setSelected(item); }}>Đồng ý xác minh</RowAction>}
      <RowAction className="admin-more" tone="muted" label={"Chi tiết yêu cầu của " + item.user.full_name} onClick={() => setDetails(item)}><Icon name="more-vertical" size={16} /></RowAction>
    </div> },
  ];
  return <div className="admin-stack">
    <AdminHeading title="Xác minh email" description="Xem yêu cầu của người dùng và đồng ý xác minh email. Thao tác được lưu trong nhật ký; không mở khóa tài khoản." />
    <OfflineNotice online={online} />
    <AdminMetrics columns={3} metrics={[
      { label: "Chờ xác minh", value: pending, icon: "clock", tone: "warning", unit: "yêu cầu" },
      { label: "Đã xác minh hôm nay", value: summary?.approved_today, icon: "mail-check", unit: "tài khoản" },
      { label: "Tỷ lệ xác minh thành công", value: formatAdminPercent(summary?.approval_rate), icon: "check" },
    ]} />
    <SectionCard className="admin-table-panel" bodyClassName="p-0 lg:p-0">
      <div><AdminToolbar>
        <ToolbarField label="Trạng thái" htmlFor="verification-status"><Select id="verification-status" value={status} onChange={(event) => apply({ status: event.target.value })}><option value="PENDING">Chờ duyệt</option><option value="APPROVED">Đã xác minh</option><option value="ALL">Tất cả</option></Select></ToolbarField>
        <button type="button" className="admin-utility" disabled={query.isFetching} onClick={() => void query.refetch()}><Icon name="refresh" size={16} />Tải lại</button>
        <div className="admin-quiet-search w-full sm:w-64">
          <SearchInput label="Tìm yêu cầu xác minh" value={search} onValueChange={setSearch} onSubmit={() => apply({ q: search.trim() || null })} placeholder="Tìm theo tên, email…" />
        </div>
      </AdminToolbar>{query.isError && <QueryFailure error={query.error} retry={() => void query.refetch()} />}</div>
      {!query.isError && <DataTable columns={columns} rows={query.data?.items ?? []} rowKey={(item) => item.id} loading={query.isPending} empty={<EmptyState title="Không có yêu cầu xác minh email" description="Yêu cầu mới sẽ xuất hiện tại đây và trong thông báo của admin." />} />}
      {query.data && <AdminPagination meta={query.data.meta} shown={query.data.items.length} qualifier={status === "PENDING" ? "chờ duyệt" : status === "APPROVED" ? "đã xác minh" : undefined} onPageChange={(next) => apply({ page: String(next) })} />}
    </SectionCard>
    <AdminNotice title="Lưu ý kiểm duyệt bảo mật">
      Chỉ phê duyệt thủ công khi người dùng gặp vấn đề với liên kết xác minh hoặc có yêu cầu hỗ trợ hợp lệ. Mọi thao tác của quản trị viên được ghi trong <Link to="/admin/audit">Nhật ký hệ thống</Link> để phục vụ truy vết an ninh.
    </AdminNotice>
    {details && <Dialog open onClose={() => setDetails(null)} title="Chi tiết yêu cầu xác minh"
      footer={<Link to={"/admin/users?selected=" + encodeURIComponent(details.user.id)} className="admin-utility">Xem tài khoản</Link>}>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-3">
        <dt>Người dùng</dt><dd className="break-words">{details.user.full_name}</dd>
        <dt>Email</dt><dd className="break-all">{details.user.email}</dd>
        <dt>Ngày gửi</dt><dd>{formatDateTime(details.requested_at)}</dd>
        <dt>Trạng thái</dt><dd>{details.status === "PENDING" ? "Chờ duyệt" : "Đã xác minh"}</dd>
        {details.approved_at && <><dt>Ngày duyệt</dt><dd>{formatDateTime(details.approved_at)}</dd></>}
      </dl>
    </Dialog>}
    {selected && <ConfirmDialog title="Đồng ý xác minh email?" tone="primary" description={<>
      Xác nhận email {selected.user.email} của {selected.user.full_name}. Thao tác này không thay đổi vai trò hoặc mở khóa tài khoản.
      {approve.isError && <span className="mt-3 block text-danger" role="alert">{String(approve.error instanceof Error ? approve.error.message : "Không thể duyệt yêu cầu. Vui lòng thử lại.")}</span>}
      {!online && <span className="mt-3 block text-danger">Bạn đang ngoại tuyến. Kết nối lại để duyệt.</span>}
    </>} confirmLabel="Đồng ý xác minh" loading={approve.isPending} onConfirm={() => { if (online) approve.mutate(selected.id); }} onCancel={() => { if (!approve.isPending) setSelected(null); }} />}
  </div>;
}
