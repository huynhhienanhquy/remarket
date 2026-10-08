import { forwardRef } from "react";
import type {
  InputHTMLAttributes,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

const INPUT_BASE =
  "w-full min-h-[44px] rounded-control border bg-surface px-3 py-2 text-[16px] text-ink placeholder:text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus";

/** Exactly one border color class so the error state always wins. */
export function inputClasses(error = false): string {
  return `${INPUT_BASE} ${error ? "border-danger" : "border-input-line"}`;
}

export function hasErrorAttr(value: boolean | "true" | "false" | "grammar" | "spelling" | undefined): boolean {
  return value === true || value === "true";
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { error = false, className, type = "text", ...rest },
  ref,
) {
  const invalid = hasErrorAttr(rest["aria-invalid"]) || error;
  return (
    <input
      ref={ref}
      type={type}
      {...rest}
      aria-invalid={invalid ? true : rest["aria-invalid"]}
      className={[inputClasses(error), className ?? ""].join(" ")}
    />
  );
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { error = false, className, ...rest },
  ref,
) {
  const invalid = hasErrorAttr(rest["aria-invalid"]) || error;
  return (
    <textarea
      ref={ref}
      {...rest}
      aria-invalid={invalid ? true : rest["aria-invalid"]}
      className={[inputClasses(error), "min-h-[120px] resize-y", className ?? ""].join(" ")}
    />
  );
});

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  error?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { error = false, className, children, ...rest },
  ref,
) {
  const invalid = hasErrorAttr(rest["aria-invalid"]) || error;
  return (
    <select
      ref={ref}
      {...rest}
      aria-invalid={invalid ? true : rest["aria-invalid"]}
      className={[inputClasses(error), className ?? ""].join(" ")}
    >
      {children}
    </select>
  );
});
