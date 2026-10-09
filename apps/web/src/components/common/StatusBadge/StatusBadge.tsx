import type { Tone } from "@remarket/shared";

const TONES: Record<Tone, string> = {
  brand: "text-brand bg-brand-soft",
  warning: "text-accent bg-warning-bg",
  danger: "text-danger bg-danger-bg",
  info: "text-info bg-info-bg",
  neutral: "text-muted bg-surface-subtle",
};

export interface StatusBadgeProps {
  /** Text always renders: status must never be conveyed by colour alone. */
  label: string;
  tone: Tone;
  size?: "sm" | "md";
  className?: string;
}

export function StatusBadge({ label, tone, size = "md", className }: StatusBadgeProps) {
  const sizing = size === "sm" ? "t-meta px-2 py-0.5" : "t-label px-2.5 py-1";
  return (
    <span
      className={["inline-flex items-center whitespace-nowrap rounded-full", TONES[tone], sizing, className ?? ""].join(
        " ",
      )}
    >
      {label}
    </span>
  );
}
