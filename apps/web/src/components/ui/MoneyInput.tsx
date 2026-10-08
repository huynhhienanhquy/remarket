import { forwardRef, useEffect, useState } from "react";
import type { InputHTMLAttributes } from "react";
import { formatVndWhileTyping } from "@remarket/shared";
import { hasErrorAttr, inputClasses } from "./Input";

export interface MoneyInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "defaultValue" | "onChange"> {
  /** Controlled raw value: digits only, never a formatted string. */
  value: string;
  onValueChange: (value: string) => void;
  error?: boolean;
}

/**
 * VND amount field: the form always sees digits while the screen shows grouped
 * thousands after blur (ui-spec 4 — raw value is an integer string, not float).
 */
export const MoneyInput = forwardRef<HTMLInputElement, MoneyInputProps>(function MoneyInput(
  { value, onValueChange, error = false, className, onBlur, ...rest },
  ref,
) {
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    setDisplay(value);
  }, [value]);

  const invalid = hasErrorAttr(rest["aria-invalid"]) || error;

  return (
    <input
      ref={ref}
      {...rest}
      value={display}
      inputMode="numeric"
      autoComplete="off"
      onChange={(event) => {
        const digits = event.target.value.replace(/[^0-9]/g, "");
        setDisplay(digits);
        onValueChange(digits);
      }}
      onBlur={(event) => {
        setDisplay(formatVndWhileTyping(display));
        onBlur?.(event);
      }}
      aria-invalid={invalid ? true : rest["aria-invalid"]}
      className={[inputClasses(error), className ?? ""].join(" ")}
    />
  );
});
