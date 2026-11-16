import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { validateEmail, validateFullName, validatePassword, validatePasswordConfirm, validatePhone } from "@remarket/shared";
import { Button } from "../../../components/common/Button/Button";
import { Dialog } from "../../../components/common/Dialog/Dialog";
import { FormField } from "../../../components/common/FormField/FormField";
import { InlineAlert } from "../../../components/common/InlineAlert/InlineAlert";
import { Input } from "../../../components/common/Input/Input";
import { useToast } from "../../../components/common/Toast/Toast";
import { PasswordInput } from "@/components/common/Input/PasswordInput";
import { invalidateAdminResources } from "@/helpers/adminCache";
import { errorDescription, fieldError } from "@/helpers/adminErrors";
import { api } from "@/services/api";

const emptyForm = { full_name: "", email: "", phone: "", password: "", confirm: "" };

export function AdminCreateUserDialog({ onClose }: { onClose: () => void }) {
  const client = useQueryClient();
  const toast = useToast();
  const [values, setValues] = useState(emptyForm);
  const [submitted, setSubmitted] = useState(false);
  const errors = {
    full_name: validateFullName(values.full_name),
    email: validateEmail(values.email),
    phone: validatePhone(values.phone),
    password: validatePassword(values.password),
    confirm: validatePasswordConfirm(values.password, values.confirm),
  };

  const mutation = useMutation({
    mutationFn: () => api.admin.createUser({
      full_name: values.full_name, email: values.email, phone: values.phone, password: values.password,
    }),
    onSuccess: () => {
      void invalidateAdminResources(client, "users", "dashboard", "audit");
      toast.success("Đã thêm người dùng");
      onClose();
    },
  });

  function change(field: keyof typeof values, value: string) {
    setValues(current => ({ ...current, [field]: value }));
    if (mutation.isError) mutation.reset();
  }

  function errorFor(field: keyof typeof values) {
    return (submitted ? errors[field] : null) ?? fieldError(mutation.error, field);
  }

  return (
    <Dialog open onClose={onClose} dismissible={!mutation.isPending} title="Thêm người dùng mới"
      footer={<>
        <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>Hủy</Button>
        <Button form="admin-create-user" type="submit" loading={mutation.isPending}>Thêm người dùng</Button>
      </>}>
      <form id="admin-create-user" className="space-y-4" noValidate onSubmit={event => {
        event.preventDefault();
        setSubmitted(true);
        if (!Object.values(errors).some(Boolean) && !mutation.isPending) mutation.mutate();
      }}>
        {mutation.isError && <InlineAlert tone="danger" title="Chưa thể thêm người dùng">{errorDescription(mutation.error)}</InlineAlert>}
        <FormField label="Họ và tên" htmlFor="admin-new-name" required error={errorFor("full_name")}><Input id="admin-new-name" value={values.full_name} autoComplete="off" onChange={event => change("full_name", event.target.value)} /></FormField>
        <FormField label="Email" htmlFor="admin-new-email" required error={errorFor("email")}><Input id="admin-new-email" type="email" value={values.email} autoComplete="off" onChange={event => change("email", event.target.value)} /></FormField>
        <FormField label="Số điện thoại" htmlFor="admin-new-phone" required error={errorFor("phone")}><Input id="admin-new-phone" type="tel" value={values.phone} autoComplete="off" onChange={event => change("phone", event.target.value)} /></FormField>
        <FormField label="Mật khẩu" htmlFor="admin-new-password" required error={errorFor("password")}><PasswordInput id="admin-new-password" value={values.password} autoComplete="new-password" onChange={event => change("password", event.target.value)} /></FormField>
        <FormField label="Nhập lại mật khẩu" htmlFor="admin-new-confirm" required error={errorFor("confirm")}><PasswordInput id="admin-new-confirm" value={values.confirm} autoComplete="new-password" onChange={event => change("confirm", event.target.value)} /></FormField>
      </form>
    </Dialog>
  );
}
