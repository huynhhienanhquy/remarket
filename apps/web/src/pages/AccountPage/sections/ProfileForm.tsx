import { useProfileForm } from "../hooks/useProfileForm";
import { Link } from "react-router-dom";
import { validateFullName, validatePhone } from "@remarket/shared";
import type { SessionUser } from "@remarket/shared";
import { ApiImage, Button, ConfirmDialog, FormField, Icon, Input, Select, Textarea } from "@/components/common";
import { OfflineNotice, QueryFailure } from "@/components/common/PageFeedback/PageFeedback";

export function ProfileForm({ viewer }: { viewer: SessionUser }) {
  const {
    toast,
    online,
    name,
    setName,
    phone,
    setPhone,
    province,
    setProvince,
    address,
    setAddress,
    fields,
    setFields,
    logoutConfirm,
    setLogoutConfirm,
    avatarInput,
    provinces,
    save,
    avatar,
    logoutAll,
    busy,
    dirty,
  } = useProfileForm(viewer);

  return <div className="space-y-6">
    <OfflineNotice online={online} />
    <section className="rm-account-card p-5 sm:p-6">
      <div className="mb-6 flex flex-wrap items-center gap-5 rounded-2xl bg-page p-4 sm:p-5">
        {viewer.avatar_url ? <ApiImage src={viewer.avatar_url} alt="Ảnh đại diện" className="h-20 w-20 rounded-2xl object-cover" /> : <span className="grid h-20 w-20 place-items-center rounded-2xl border border-brand/10 bg-brand-soft text-3xl font-semibold text-brand">{viewer.full_name.slice(0, 1)}</span>}
        <div className="min-w-0 flex-1"><p className="mb-3 break-words text-lg font-semibold text-ink">{viewer.full_name}</p><FormField label="Ảnh đại diện" htmlFor="profile-avatar" helper="JPG, PNG hoặc WebP, tối đa 5 MB."><Input hidden ref={avatarInput} id="profile-avatar" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy || !online} onChange={(event) => {
          const file = event.target.files?.[0]; event.target.value = ""; if (!file || busy || !online) return;
          if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) { toast.error("Ảnh cần là JPG, PNG hoặc WebP và không quá 5 MB."); return; }
          avatar.mutate(file);
        }} /><Button variant="secondary" disabled={busy || !online} loading={avatar.isPending} onClick={() => avatarInput.current?.click()}><span className="flex items-center gap-2"><Icon name="camera" size={18} />Đổi ảnh</span></Button></FormField>{avatar.isPending && <p role="status">Đang tải ảnh…</p>}</div>
      </div>
      {avatar.isError && <QueryFailure error={avatar.error} />}
      {save.isError && <QueryFailure error={save.error} />}
      <div className="mb-5"><h2 className="text-lg font-semibold text-ink">Thông tin cá nhân</h2><p className="mt-1 text-sm text-muted">Cập nhật thông tin để việc mua bán và giao nhận thuận tiện hơn.</p></div>
      <form className="grid gap-5 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); if (busy || !online || !dirty) return;
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
        <div className="flex flex-col-reverse gap-3 border-t border-line pt-5 sm:col-span-2 sm:flex-row sm:justify-end"><Button variant="secondary" disabled={!dirty || busy} onClick={() => { setName(viewer.full_name); setPhone(viewer.phone ?? ""); setProvince(viewer.province_code ?? ""); setAddress(viewer.default_address ?? ""); setFields({}); save.reset(); }}>Hủy thay đổi</Button><Button type="submit" loading={save.isPending} disabled={!dirty || busy || !online}>Lưu thay đổi</Button></div>
      </form>
    </section>
    <section className="rm-account-card space-y-4 p-5 sm:p-6"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-soft text-brand"><Icon name="check" /></span><h2 className="text-lg font-semibold text-ink">Bảo mật tài khoản</h2></div>
      <p className="text-sm text-muted">{viewer.email_verified_at ? "Email đã được xác minh." : "Xác minh email để đăng bán, mua hàng và nhắn tin."}</p>
      {!viewer.email_verified_at && <Link className="inline-block text-brand" to="/verify-email">Xác minh email</Link>}
      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4"><Link to="/forgot-password" className="flex min-h-[44px] items-center gap-2 rounded-xl bg-brand-soft px-4 text-sm font-semibold text-brand hover:bg-brand-soft/70">Đặt lại mật khẩu <Icon name="chevron-right" size={16} /></Link><Button variant="secondary" disabled={busy || !online} onClick={() => setLogoutConfirm(true)}>Đăng xuất tất cả thiết bị</Button></div>
      {logoutAll.isError && <QueryFailure error={logoutAll.error} />}
    </section>
    {logoutConfirm && <ConfirmDialog title="Đăng xuất tất cả thiết bị?" description="Tất cả phiên đăng nhập, bao gồm phiên hiện tại, sẽ được kết thúc." confirmLabel="Đăng xuất tất cả" loading={logoutAll.isPending} onCancel={() => setLogoutConfirm(false)} onConfirm={() => { if (online) logoutAll.mutate(); }} />}
  </div>;
}
