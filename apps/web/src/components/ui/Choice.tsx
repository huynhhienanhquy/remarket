import { forwardRef, useEffect, useRef } from "react";
import type { ForwardedRef, InputHTMLAttributes, ReactNode } from "react";

function assignRef<T>(ref: ForwardedRef<T>, node: T | null) {
  if (typeof ref === "function") {
    ref(node);
  } else if (ref !== null && typeof ref === "object") {
    ref.current = node;
  }
}

const CONTROL =
  "mt-0.5 h-[18px] w-[18px] shrink-0 cursor-pointer border border-input-line accent-brand disabled:cursor-not-allowed disabled:opacity-60";

const WRAPPER =
  "flex items-start gap-2.5 cursor-pointer disabled:cursor-not-allowed disabled:opacity-60";

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: ReactNode;
  description?: ReactNode;
  /** Native `indeterminate` is an IDL property, so it needs a ref (ui-spec 4). */
  indeterminate?: boolean;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, description, indeterminate = false, className, disabled, ...rest },
  ref,
) {
  const innerRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (innerRef.current) innerRef.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return (
    <label className={[WRAPPER, className ?? ""].join(" ")}>
      <input
        type="checkbox"
        ref={(node) => {
          innerRef.current = node;
          if (node) node.indeterminate = indeterminate;
          assignRef(ref, node);
        }}
        disabled={disabled}
        className={CONTROL}
        {...rest}
      />
      <span className="min-w-0">
        <span className="t-label text-ink">{label}</span>
        {description && <span className="mt-0.5 block t-meta text-muted">{description}</span>}
      </span>
    </label>
  );
});

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
