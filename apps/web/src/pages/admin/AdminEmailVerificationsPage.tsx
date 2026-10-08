import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDateTime, type EmailVerificationRequest } from "@remarket/shared";
import { api } from "../../lib/api";
import { queryKeys } from "../../lib/queryClient";
import { Button, ConfirmDialog, EmptyState, Pagination, SectionCard, Select, StatusBadge, useToast } from "../../components/ui";
import type { DataTableColumn } from "../../components/ui";
import { OfflineNotice, QueryFailure, useConnectivity } from "../../components/features/PageFeedback";
import { AdminDataTable as DataTable, AdminHeading, AdminToolbar, ToolbarField, readEnumParam, readPage, useAdminParams } from "./adminShared";

export function AdminEmailVerificationsPage() {
  const { params, apply } = useAdminParams();
  const status = readEnumParam(params, "status", ["PENDING", "APPROVED", "ALL"] as const) || "PENDING";
  const page = readPage(params);
  const client = useQueryClient();
  const toast = useToast();
  const online = useConnectivity();
  const [selected, setSelected] = useState<EmailVerificationRequest | null>(null);
  const query = useQuery({ queryKey: queryKeys.adminEmailVerifications({ status, page }), queryFn: () => api.admin.emailVerifications({ status, page }), refetchInterval: 15000 });
  const approve = useMutation({
    mutationFn: (id: string) => api.admin.approveEmailVerification(id),
    onSuccess: () => {
      toast.success("Đã xác minh email"); setSelected(null);
      if (status === "PENDING" && query.data?.items.length === 1 && page > 1) apply({ page: String(page - 1) }, { replace: true });
      for (const key of ["admin", "notifications", "email-verification"]) void client.invalidateQueries({ queryKey: [key] });
    },
  });
  const columns: DataTableColumn<EmailVerificationRequest>[] = [
    { key: "user", header: "Người dùng", render: (item) => <div className="min-w-0"><p className="t-label text-ink break-words">{item.user.full_name}</p><p className="t-meta text-muted break-all">{item.user.email}</p></div> },
    { key: "requested_at", header: "Ngày gửi", render: (item) => <time dateTime={item.requested_at}>{formatDateTime(item.requested_at)}</time>, hideOnMobile: true },
    { key: "status", header: "Trạng thái", render: (item) => <div className="space-y-1"><StatusBadge label={item.status === "PENDING" ? "Chờ duyệt" : "Đã xác minh"} tone={item.status === "PENDING" ? "warning" : "brand"} size="sm" />{item.user.status === "LOCKED" && <StatusBadge label="Tài khoản bị khóa" tone="danger" size="sm" />}</div> },
    { key: "approved_at", header: "Ngày duyệt", render: (item) => item.approved_at ? <time dateTime={item.approved_at}>{formatDateTime(item.approved_at)}</time> : "—", hideOnMobile: true },
    { key: "id", header: "Thao tác", render: (item) => item.status === "PENDING" ? <Button variant="secondary" disabled={!online || approve.isPending} onClick={() => { approve.reset(); setSelected(item); }}>Đồng ý xác minh</Button> : null },
  ];
  return <div className="space-y-4">
    <AdminHeading title="Xác minh email" description="Xem yêu cầu của người dùng và đồng ý xác minh email. Thao tác được lưu trong nhật ký; không mở khóa tài khoản." />
    <OfflineNotice online={online} />
    <SectionCard bodyClassName="p-0 lg:p-0">
      <div className="p-4 lg:p-6"><AdminToolbar>
        <ToolbarField label="Trạng thái" htmlFor="verification-status"><Select id="verification-status" value={status} onChange={(event) => apply({ status: event.target.value })}><option value="PENDING">Chờ duyệt</option><option value="APPROVED">Đã xác minh</option><option value="ALL">Tất cả</option></Select></ToolbarField>
        <Button variant="secondary" loading={query.isFetching} onClick={() => void query.refetch()}>Tải lại</Button>
      </AdminToolbar>{query.isError && <QueryFailure error={query.error} retry={() => void query.refetch()} />}</div>
      {!query.isError && <DataTable columns={columns} rows={query.data?.items ?? []} rowKey={(item) => item.id} loading={query.isPending} empty={<EmptyState title="Không có yêu cầu xác minh email" description="Yêu cầu mới sẽ xuất hiện tại đây và trong thông báo của admin." />} />}
      {query.data && <Pagination className="p-4" page={page} totalPages={query.data.meta.total_pages} total={query.data.meta.total} onPageChange={(next) => apply({ page: String(next) })} />}
    </SectionCard>
    {selected && <ConfirmDialog title="Đồng ý xác minh email?" tone="primary" description={<>
      Xác nhận email {selected.user.email} của {selected.user.full_name}. Thao tác này không thay đổi vai trò hoặc mở khóa tài khoản.
      {approve.isError && <span className="mt-3 block text-danger" role="alert">{String(approve.error instanceof Error ? approve.error.message : "Không thể duyệt yêu cầu. Vui lòng thử lại.")}</span>}
      {!online && <span className="mt-3 block text-danger">Bạn đang ngoại tuyến. Kết nối lại để duyệt.</span>}
    </>} confirmLabel="Đồng ý xác minh" loading={approve.isPending} onConfirm={() => { if (online) approve.mutate(selected.id); }} onCancel={() => { if (!approve.isPending) setSelected(null); }} />}
  </div>;
}
