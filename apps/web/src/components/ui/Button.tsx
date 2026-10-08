import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";
import { Spinner } from "./Spinner";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "md" | "lg";

// t-label is unlayered CSS, so no font-* utility may be combined with it.
const BASE =
  "inline-flex items-center justify-center gap-2 rounded-control t-label transition-colors disabled:opacity-60 disabled:cursor-not-allowed";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-brand text-white hover:bg-brand-hover",
  secondary: "border border-brand text-brand hover:bg-brand-soft",
  ghost: "text-ink hover:bg-surface-subtle",
  danger: "bg-danger text-white hover:bg-danger/90",
};

const SIZES: Record<ButtonSize, string> = {
  md: "min-h-[44px] px-4",
  lg: "h-12 px-5",
};

/**
 * Shared class builder so react-router <Link> elements can look and behave
 * like buttons without nesting an interactive element inside another.
 */
export function buttonClasses(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
  fullWidth = false,
): string {
  return [BASE, VARIANTS[variant], SIZES[size], fullWidth ? "w-full" : ""]
    .filter(Boolean)
    .join(" ");
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Keeps the button width and disables it while the action is running. */
  loading?: boolean;
  fullWidth?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "md",
    loading = false,
    fullWidth = false,
    className,
    disabled,
    type = "button",
    children,
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled === true || loading}
      aria-busy={loading}
      className={[buttonClasses(variant, size, fullWidth), className ?? ""].join(" ")}
      {...rest}
    >
      <span className="relative inline-flex items-center">
        {/* Opacity instead of visibility: the label keeps its width and stays
            announced by screen readers while the spinner shows. */}
        <span className={loading ? "opacity-0" : undefined}>{children}</span>
        {loading && <Spinner className="absolute inset-0 m-auto" size={size === "lg" ? 20 : 16} />}
      </span>
    </button>
  );
});
