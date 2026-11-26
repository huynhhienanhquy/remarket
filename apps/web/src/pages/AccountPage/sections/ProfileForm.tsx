import { useId, useRef } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { validateFullName, validatePhone } from "@remarket/shared";
import type { SessionUser } from "@remarket/shared";
import { ApiImage } from "../../../components/common/ApiImage/ApiImage";
import { Button } from "../../../components/common/Button/Button";
import { ConfirmDialog, Dialog } from "../../../components/common/Dialog/Dialog";
import { FormField } from "../../../components/common/FormField/FormField";
import { Icon } from "../../../components/common/Icon/Icon";
import { Input, Select, Textarea } from "../../../components/common/Input/Input";
import { OfflineNotice, QueryFailure } from "@/components/common/PageFeedback/PageFeedback";
import { useProfileForm } from "../hooks/useProfileForm";

export function ProfileForm({ viewer }: { viewer: SessionUser }) {
  const headingId = useId();
  const editorFormId = useId();
  const nameInput = useRef<HTMLInputElement>(null);
  const {
    toast,
    online,
    editing,
    openEditor,
    closeEditor,
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

  const details = [
    { label: "Họ và tên", icon: "user", value: viewer.full_name },
    { label: "Email", icon: "mail", value: viewer.email },
    { label: "Số điện thoại", icon: "phone", value: viewer.phone },
    { label: "Địa chỉ", icon: "map-pin", value: viewer.default_address },
  ] as const;

  function submitProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !online || !dirty) return;

    const errors: Record<string, string> = {};
    const nameError = validateFullName(name);
    if (nameError) errors.full_name = nameError;
    const phoneError = phone.trim() ? validatePhone(phone) : null;
    if (phoneError) errors.phone = phoneError;
    if (address.trim().length > 300) errors.default_address = "Địa chỉ tối đa 300 ký tự.";
    setFields(errors);
    if (Object.keys(errors).length === 0) save.mutate();
  }

  return (
    <div className="space-y-6">
      <OfflineNotice online={online} />
      <section aria-labelledby={headingId} className="rm-account-card p-4 sm:p-5">
        <h2 id={headingId} className="border-b border-line pb-3 t-h3 text-ink">Thông tin cá nhân</h2>
        <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 px-1 py-3 min-[480px]:grid-cols-[auto_minmax(0,1fr)_auto] sm:gap-x-5">
          {viewer.avatar_url ? (
            <ApiImage src={viewer.avatar_url} alt="Ảnh đại diện" className="h-16 w-16 rounded-full object-cover sm:h-[88px] sm:w-[88px]" />
          ) : (
            <span aria-hidden="true" className="grid h-16 w-16 place-items-center rounded-full bg-brand-soft text-2xl font-semibold text-brand sm:h-[88px] sm:w-[88px]">
              {viewer.full_name.slice(0, 1).toUpperCase()}
            </span>
          )}
          <div className="min-w-0">
            <p className="font-semibold leading-6 text-ink [overflow-wrap:anywhere] sm:text-xl">{viewer.full_name}</p>
            <p className="mt-1 text-sm text-muted [overflow-wrap:anywhere]">{viewer.email}</p>
          </div>
          <Button
            variant="secondary"
            aria-haspopup="dialog"
            className="col-span-2 justify-self-end !border-brand/20 !bg-brand-soft hover:!border-brand/50 min-[480px]:col-span-1 min-[480px]:self-start"
            disabled={logoutAll.isPending || !online}
            onClick={openEditor}
          >
            <span className="flex items-center gap-1.5"><Icon name="edit" size={16} />Chỉnh sửa</span>
          </Button>
        </div>
        <dl className="divide-y divide-line rounded-xl border border-line bg-page/40 px-3 sm:px-4">
          {details.map(({ label, icon, value }) => (
            <div key={label} className="grid grid-cols-[minmax(0,0.62fr)_minmax(0,1fr)] gap-x-3 py-2.5 text-sm min-[480px]:gap-x-4">
              <dt className="flex min-w-0 items-start gap-2 text-ink sm:gap-3">
                <Icon name={icon} size={17} className="mt-0.5 shrink-0 text-muted" />
                <span>{label}</span>
              </dt>
              <dd className={value ? "whitespace-pre-line text-ink [overflow-wrap:anywhere]" : "text-muted"}>
                {value || "Chưa cập nhật"}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="rm-account-card space-y-4 p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-soft text-brand"><Icon name="check" /></span>
          <h2 className="text-lg font-semibold text-ink">Bảo mật tài khoản</h2>
        </div>
        <p className="text-sm text-muted">{viewer.email_verified_at ? "Email đã được xác minh." : "Xác minh email để đăng bán, mua hàng và nhắn tin."}</p>
        {!viewer.email_verified_at && <Link className="inline-block text-brand" to="/verify-email">Xác minh email</Link>}
        <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
          <Link to="/forgot-password" className="rm-control flex min-h-[44px] items-center gap-2 rounded-xl bg-brand-soft px-4 text-sm font-semibold text-brand hover:bg-brand-soft/70">Đặt lại mật khẩu <Icon name="chevron-right" size={16} /></Link>
          <Button variant="secondary" disabled={busy || !online} onClick={() => setLogoutConfirm(true)}>Đăng xuất tất cả thiết bị</Button>
        </div>
        {logoutAll.isError && <QueryFailure error={logoutAll.error} />}
      </section>

      <Dialog
        open={editing}
        title="Chỉnh sửa thông tin cá nhân"
        onClose={closeEditor}
        dismissible={!busy}
        initialFocusRef={nameInput}
        footer={
          <>
            <Button variant="secondary" disabled={busy} onClick={closeEditor}>Hủy</Button>
            <Button type="submit" form={editorFormId} loading={save.isPending} disabled={!dirty || busy || !online}>Lưu thay đổi</Button>
          </>
        }
      >
        <div className="space-y-4">
          <OfflineNotice online={online} />
          {avatar.isError && <QueryFailure error={avatar.error} />}
          {save.isError && <QueryFailure error={save.error} />}
          <div className="rounded-xl border border-line bg-page/50 p-3">
            <input
              ref={avatarInput}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              disabled={busy || !online}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = "";
                if (!file || busy || !online) return;
                if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) {
                  toast.error("Ảnh cần là JPG, PNG hoặc WebP và không quá 5 MB.");
                  return;
                }
                avatar.mutate(file);
              }}
            />
            <Button variant="secondary" disabled={busy || !online} loading={avatar.isPending} onClick={() => avatarInput.current?.click()}>
              <span className="flex items-center gap-2"><Icon name="camera" size={18} />Đổi ảnh đại diện</span>
            </Button>
            <p className="mt-2 t-meta text-muted">Ảnh được cập nhật ngay sau khi tải lên. JPG, PNG hoặc WebP, tối đa 5 MB.</p>
            {avatar.isPending && <p role="status" className="mt-1 t-meta text-muted">Đang tải ảnh…</p>}
          </div>
          <form id={editorFormId} className="grid gap-4 sm:grid-cols-2" onSubmit={submitProfile}>
            <FormField label="Họ và tên" htmlFor="profile-name" required error={fields.full_name}>
              <Input ref={nameInput} id="profile-name" value={name} maxLength={100} disabled={busy} onChange={(event) => setName(event.target.value)} />
            </FormField>
            <FormField label="Số điện thoại" htmlFor="profile-phone" error={fields.phone}>
              <Input id="profile-phone" type="tel" value={phone} maxLength={20} disabled={busy} onChange={(event) => setPhone(event.target.value)} />
            </FormField>
            <FormField label="Email" htmlFor="profile-email" helper={viewer.email_verified_at ? "Đã xác minh email" : "Email chưa xác minh"}>
              <Input id="profile-email" type="email" value={viewer.email} readOnly />
            </FormField>
            <FormField label="Khu vực" htmlFor="profile-province" error={fields.province_code}>
              <Select id="profile-province" value={province} disabled={busy || provinces.isPending || provinces.isError} onChange={(event) => setProvince(event.target.value)}>
                <option value="">Chưa chọn khu vực</option>
                {provinces.data?.map((entry) => <option key={entry.code} value={entry.code}>{entry.name}</option>)}
              </Select>
            </FormField>
            {provinces.isError && <div className="sm:col-span-2"><QueryFailure error={provinces.error} retry={() => void provinces.refetch()} /></div>}
            <FormField label="Địa chỉ mặc định" htmlFor="profile-address" error={fields.default_address} className="sm:col-span-2">
              <Textarea id="profile-address" value={address} maxLength={300} disabled={busy} onChange={(event) => setAddress(event.target.value)} />
            </FormField>
          </form>
        </div>
      </Dialog>
      {logoutConfirm && (
        <ConfirmDialog
          title="Đăng xuất tất cả thiết bị?"
          description="Tất cả phiên đăng nhập, bao gồm phiên hiện tại, sẽ được kết thúc."
          confirmLabel="Đăng xuất tất cả"
          loading={logoutAll.isPending}
          onCancel={() => setLogoutConfirm(false)}
          onConfirm={() => { if (online) logoutAll.mutate(); }}
        />
      )}
    </div>
  );
}
