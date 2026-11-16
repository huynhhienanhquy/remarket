import { forwardRef } from "react";
import type { InputHTMLAttributes, ReactNode } from "react";

const CONTROL =
  "mt-0.5 h-[18px] w-[18px] shrink-0 cursor-pointer border border-input-line accent-brand disabled:cursor-not-allowed disabled:opacity-60";

const WRAPPER =
  "flex items-start gap-2.5 cursor-pointer disabled:cursor-not-allowed disabled:opacity-60";

export interface RadioProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: ReactNode;
  description?: ReactNode;
}

export const Radio = forwardRef<HTMLInputElement, RadioProps>(function Radio(
  { label, description, className, disabled, ...rest },
  ref,
) {
  return (
    <label className={[WRAPPER, className ?? ""].join(" ")}>
      <input
        type="radio"
        ref={ref}
        disabled={disabled}
        className={[CONTROL, "rounded-full"].join(" ")}
        {...rest}
      />
      <span className="min-w-0">
        <span className="t-label text-ink">{label}</span>
        {description && <span className="mt-0.5 block t-meta text-muted">{description}</span>}
      </span>
    </label>
  );
});
