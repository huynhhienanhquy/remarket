import { useId } from "react";
import type { ReactNode } from "react";
import { FormField } from "../FormField/FormField";

export interface FormRowProps {
  label: string;
  required?: boolean;
  error?: string;
  children: ReactNode;
  helper?: string;
  className?: string;
}

export function FormRow({ label, required, error, children, helper, className }: FormRowProps) {
  const htmlFor = useId();
  return (
    <div className={className ?? ""}>
      <FormField label={label} htmlFor={htmlFor} required={required} error={error} helper={helper}>
        {children}
      </FormField>
    </div>
  );
}