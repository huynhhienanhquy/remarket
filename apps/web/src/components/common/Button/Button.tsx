import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";
import { Spinner } from "../Spinner/Spinner";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "md" | "lg";

const BASE =
  "rm-button inline-flex items-center justify-center gap-2 rounded-control text-sm font-semibold leading-5 disabled:opacity-60 disabled:cursor-not-allowed";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "rm-button-primary bg-brand text-white",
  secondary: "rm-button-secondary border border-brand bg-surface text-brand",
  ghost: "rm-button-ghost text-ink",
  danger: "rm-button-danger bg-danger text-white",
};

const SIZES: Record<ButtonSize, string> = {
  md: "min-h-touch px-4 py-2.5",
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
      <span className="rm-button-content relative inline-flex items-center">
        {/* Opacity instead of visibility: the label keeps its width and stays
            announced by screen readers while the spinner shows. */}
        <span className={loading ? "opacity-0" : undefined}>{children}</span>
        {loading && <Spinner className="absolute inset-0 m-auto" size={size === "lg" ? 20 : 16} />}
      </span>
    </button>
  );
});
