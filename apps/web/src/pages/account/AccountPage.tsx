import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { validateFullName, validatePhone } from "@remarket/shared";
import type { SessionUser } from "@remarket/shared";
import { useSession } from "../../app/SessionProvider";
import { api } from "../../lib/api";
import { queryKeys } from "../../lib/queryClient";
import { apiFieldErrors } from "../../lib/errors";
import { ApiImage, Button, ConfirmDialog, FormField, InlineAlert, Input, Select, Textarea, useToast } from "../../components/ui";
import { OfflineNotice, QueryFailure, useConnectivity } from "../../components/features/PageFeedback";

function ProfileForm({ viewer }: { viewer: SessionUser }) {
  const { refresh, expire } = useSession();
  const navigate = useNavigate();
  const toast = useToast();
  const online = useConnectivity();
  const [name, setName] = useState(viewer.full_name);
  const [phone, setPhone] = useState(viewer.phone ?? "");
  const [province, setProvince] = useState(viewer.province_code ?? "");
  const [address, setAddress] = useState(viewer.default_address ?? "");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [logoutConfirm, setLogoutConfirm] = useState(false);
  const provinces = useQuery({ queryKey: queryKeys.provinces, queryFn: () => api.categories.provinces() });
  const save = useMutation({ mutationFn: () => api.auth.updateProfile({ full_name: name.trim(), phone: phone.trim() || null, province_code: province || null, default_address: address.trim() || null }),
    onSuccess: async () => { await refresh(); toast.success("Đã lưu hồ sơ"); }, onError: (error) => setFields(apiFieldErrors(error) ?? {}) });
  const avatar = useMutation({ mutationFn: async (file: File) => { const uploaded = await api.uploads.upload(file, "avatar"); return api.auth.uploadAvatar(uploaded.storage_path); }, onSuccess: async () => { await refresh(); toast.success("Đã đổi ảnh đại diện"); } });
  const logoutAll = useMutation({ mutationFn: () => api.auth.logoutAll(), onSuccess: () => { expire(); navigate("/login", { replace: true }); } });
  const busy = save.isPending || avatar.isPending || logoutAll.isPending;
  const dirty = name !== viewer.full_name || phone !== (viewer.phone ?? "") || province !== (viewer.province_code ?? "") || address !== (viewer.default_address ?? "");
  return <div className="space-y-6">
    <OfflineNotice online={online} />
    <section className="rounded-card border border-line bg-surface p-4 sm:p-6">
      <div className="mb-6 flex flex-wrap items-center gap-4">
        {viewer.avatar_url ? <ApiImage src={viewer.avatar_url} alt="Ảnh đại diện" className="h-20 w-20 rounded-full object-cover" /> : <span className="grid h-20 w-20 place-items-center rounded-full bg-brand-soft text-2xl text-brand">{viewer.full_name.slice(0, 1)}</span>}
        <div><FormField label="Đổi ảnh" htmlFor="profile-avatar" helper="JPG, PNG hoặc WebP, tối đa 5 MB."><Input id="profile-avatar" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy || !online} onChange={(event) => {
          const file = event.target.files?.[0]; event.target.value = ""; if (!file || busy || !online) return;
          if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) { toast.error("Ảnh cần là JPG, PNG hoặc WebP và không quá 5 MB."); return; }
          avatar.mutate(file);
        }} /></FormField>{avatar.isPending && <p role="status">Đang tải ảnh…</p>}</div>
      </div>
      {avatar.isError && <QueryFailure error={avatar.error} />}
      {save.isError && <QueryFailure error={save.error} />}
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); if (busy || !online || !dirty) return;
        const errors: Record<string, string> = {}; const nameError = validateFullName(name); if (nameError) errors.full_name = nameError;
        const phoneError = phone.trim() ? validatePhone(phone) : null; if (phoneError) errors.phone = phoneError;
        if (address.trim().length > 300) errors.default_address = "Địa chỉ tối đa 300 ký tự.";
        setFields(errors); if (Object.keys(errors).length === 0) save.mutate();
      }}>
        <FormField label="Họ tên" htmlFor="profile-name" required error={fields.full_name}><Input id="profile-name" value={name} maxLength={100} disabled={busy} onChange={(event) => setName(event.target.value)} /></FormField>
        <FormField label="Số điện thoại" htmlFor="profile-phone" error={fields.phone}><Input id="profile-phone" type="tel" value={phone} maxLength={20} disabled={busy} onChange={(event) => setPhone(event.target.value)} /></FormField>
        <FormField label="Email" htmlFor="profile-email" helper={viewer.email_verified_at ? "Đã xác minh email" : "Email chưa xác minh"}><Input id="profile-email" type="email" value={viewer.email} readOnly /></FormField>
        <FormField label="Khu vực" htmlFor="profile-province" error={fields.province_code}><Select id="profile-province" value={province} disabled={busy || provinces.isPending || provinces.isError} onChange={(event) => setProvince(event.target.value)}><option value="">Chưa chọn khu vực</option>{provinces.data?.map((entry) => <option key={entry.code} value={entry.code}>{entry.name}</option>)}</Select></FormField>
        {provinces.isError && <div className="sm:col-span-2"><QueryFailure error={provinces.error} retry={() => void provinces.refetch()} /></div>}
        <FormField label="Địa chỉ mặc định" htmlFor="profile-address" error={fields.default_address} className="sm:col-span-2"><Textarea id="profile-address" value={address} maxLength={300} disabled={busy} onChange={(event) => setAddress(event.target.value)} /></FormField>
        <div className="flex flex-wrap justify-end gap-3 sm:col-span-2"><Button variant="secondary" disabled={!dirty || busy} onClick={() => { setName(viewer.full_name); setPhone(viewer.phone ?? ""); setProvince(viewer.province_code ?? ""); setAddress(viewer.default_address ?? ""); setFields({}); save.reset(); }}>Hủy thay đổi</Button><Button type="submit" loading={save.isPending} disabled={!dirty || busy || !online}>Lưu thay đổi</Button></div>
      </form>
    </section>
    <section className="space-y-4 rounded-card border border-line bg-surface p-4 sm:p-6"><h2 className="t-h2">Bảo mật tài khoản</h2>
      <p>{viewer.email_verified_at ? "Email đã được xác minh." : "Xác minh email để đăng bán, mua hàng và nhắn tin."}</p>
      {!viewer.email_verified_at && <Link className="inline-block text-brand" to="/verify-email">Xác minh email</Link>}
      <div className="flex flex-wrap items-center gap-4"><Link to="/forgot-password" className="text-brand">Đặt lại mật khẩu</Link><Button variant="secondary" disabled={busy || !online} onClick={() => setLogoutConfirm(true)}>Đăng xuất tất cả thiết bị</Button></div>
      {logoutAll.isError && <QueryFailure error={logoutAll.error} />}
    </section>
    {logoutConfirm && <ConfirmDialog title="Đăng xuất tất cả thiết bị?" description="Tất cả phiên đăng nhập, bao gồm phiên hiện tại, sẽ được kết thúc." confirmLabel="Đăng xuất tất cả" loading={logoutAll.isPending} onCancel={() => setLogoutConfirm(false)} onConfirm={() => { if (online) logoutAll.mutate(); }} />}
  </div>;
}

export function AccountPage() {
  const { viewer } = useSession();
  if (!viewer) return null;
  return <div className="space-y-6"><h1 className="t-h1">Hồ sơ cá nhân</h1>{viewer.status === "LOCKED" ? <InlineAlert tone="warning" title="Tài khoản đang bị hạn chế"><Link to="/support" className="text-brand">Liên hệ hỗ trợ</Link></InlineAlert> : <ProfileForm key={`${viewer.id}:${viewer.full_name}:${viewer.phone}:${viewer.province_code}:${viewer.default_address}`} viewer={viewer} />}</div>;
}
