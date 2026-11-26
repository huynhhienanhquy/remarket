import { useState } from "react";
import type { ComponentProps } from "react";
import { Input } from "./Input";
import { FormField } from "../FormField/FormField";
import type { FormFieldProps } from "../FormField/FormField";

export function PasswordInput({ className, ...props }: Omit<ComponentProps<typeof Input>, "type">) {
  const [visible, setVisible] = useState(false);
  return <div className="relative">
    <Input {...props} type={visible ? "text" : "password"} className={`pr-20 ${className ?? ""}`} />
    <button type="button" onClick={() => setVisible((value) => !value)}
      aria-label={visible ? "Ẩn mật khẩu" : "Hiện mật khẩu"} aria-pressed={visible}
      className="absolute inset-y-0 right-1 my-auto h-9 rounded-control px-2 t-meta text-brand hover:bg-surface-subtle focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus">
      {visible ? "Ẩn" : "Hiện"}
    </button>
  </div>;
}

/** Password control and its label, helper and error share one accessibility link. */
export function PasswordField({ id, label, helper, error, required = true, ...props }:
  Omit<ComponentProps<typeof PasswordInput>, "id" | "error"> &
  Pick<FormFieldProps, "label" | "helper"> & { id: string; error?: string | null; required?: boolean }) {
  return <FormField label={label} htmlFor={id} helper={helper} error={error} required={required}>
    <PasswordInput {...props} id={id} error={!!error} />
  </FormField>;
}
