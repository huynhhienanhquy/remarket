import type { ReactNode } from "react";

type RowActionTone = "brand" | "danger" | "muted";

const ROW_ACTION_TONES: Record<RowActionTone, string> = {
  brand: "text-brand enabled:hover:bg-brand-soft",
  danger: "text-danger enabled:hover:bg-danger-bg",
  muted: "text-ink enabled:hover:bg-surface-subtle",
};

/**
 * Compact table action with a full 44px touch target. The wrapper stops the
 * click from activating the row itself.
 */
export function RowAction({
  tone = "brand",
  onClick,
  disabled,
  label,
  className,
  children,
}: {
  tone?: RowActionTone;
  onClick: () => void;
  disabled?: boolean;
  label?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span className="inline-flex" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        data-tone={tone}
        aria-label={label}
        title={label}
        className={[
          "admin-row-action inline-flex items-center gap-1.5 whitespace-nowrap border border-line bg-surface transition-colors",
          "disabled:cursor-not-allowed disabled:opacity-50",
          ROW_ACTION_TONES[tone],
          className,
        ].filter(Boolean).join(" ")}
      >
        {children}
      </button>
    </span>
  );
}
