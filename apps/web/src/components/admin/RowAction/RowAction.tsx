import type { ReactNode } from "react";

type RowActionTone = "brand" | "danger" | "muted";

const ROW_ACTION_TONES: Record<RowActionTone, string> = {
  brand: "text-brand hover:bg-brand-soft",
  danger: "text-danger hover:bg-danger-bg",
  muted: "text-ink hover:bg-surface-subtle",
};

/**
 * Compact table action with a full 44px touch target. The wrapper stops the
 * click from activating the row itself.
 */
export function RowAction({
  tone = "brand",
  onClick,
  disabled,
  children,
}: {
  tone?: RowActionTone;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <span className="inline-flex" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={[
          "inline-flex min-h-[44px] items-center whitespace-nowrap rounded-xl border border-line bg-surface px-3 text-sm font-medium transition-colors",
          "disabled:cursor-not-allowed disabled:opacity-50",
          ROW_ACTION_TONES[tone],
        ].join(" ")}
      >
        {children}
      </button>
    </span>
  );
}
