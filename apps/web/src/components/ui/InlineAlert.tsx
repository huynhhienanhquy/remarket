import type { ComponentType, ReactNode } from "react";
import { AlertTriangleIcon, CheckIcon, InfoIcon, XIcon } from "./icons";
import type { IconProps } from "./icons";

export type InlineAlertTone = "info" | "warning" | "danger" | "success" | "neutral";

interface ToneStyle {
  panel: string;
  text: string;
  Icon: ComponentType<IconProps>;
}

const TONES: Record<InlineAlertTone, ToneStyle> = {
  info: { panel: "border-info bg-info-bg", text: "text-info", Icon: InfoIcon },
  warning: { panel: "border-accent bg-warning-bg", text: "text-accent", Icon: AlertTriangleIcon },
  danger: { panel: "border-danger bg-danger-bg", text: "text-danger", Icon: AlertTriangleIcon },
  success: { panel: "border-brand bg-brand-soft", text: "text-brand", Icon: CheckIcon },
  neutral: { panel: "border-line bg-surface-subtle", text: "text-muted", Icon: InfoIcon },
};

export interface InlineAlertProps {
  tone: InlineAlertTone;
  title: ReactNode;
  children?: ReactNode;
  /** Extra control (link or button) shown under the body. */
  action?: ReactNode;
  onClose?: () => void;
  className?: string;
}

/** Inline panel, never a floating layer: it must stay in document flow. */
export function InlineAlert({
  tone,
  title,
  children,
  action,
  onClose,
  className,
}: InlineAlertProps) {
  const toneStyle = TONES[tone];
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={[
        "flex gap-3 rounded-card border p-4",
        toneStyle.panel,
        className ?? "",
      ].join(" ")}
    >
      <span className={`mt-0.5 shrink-0 ${toneStyle.text}`}>
        <toneStyle.Icon />
      </span>
      <div className="min-w-0 flex-1">
        <p className={`text-base font-semibold ${toneStyle.text}`}>{title}</p>
        {children && <div className="mt-1 t-body text-ink">{children}</div>}
        {action && <div className="mt-3 flex flex-wrap items-center gap-2">{action}</div>}
      </div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Đóng thông báo"
          className="-mr-2 -mt-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-muted transition-colors hover:bg-surface hover:text-ink"
        >
          <XIcon />
        </button>
      )}
    </div>
  );
}
