import { useId, useRef } from "react";
import type { ReactNode, RefObject } from "react";
import { useDialogBehavior } from "./Dialog";
import { XIcon } from "./icons";

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  /** Required: it labels the drawer through aria-labelledby. */
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  dismissible?: boolean;
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** Extra width class; default is the 560px desktop maximum (ui-spec 4). */
  widthClassName?: string;
  className?: string;
}

export function Drawer({
  open,
  onClose,
  title,
  children,
  footer,
  dismissible = true,
  initialFocusRef,
  widthClassName = "max-w-[560px]",
  className,
}: DrawerProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();

  useDialogBehavior({ open, onClose, dismissible, panelRef, initialFocusRef });

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-overlay bg-ink/40 animate-fade-in"
      onClick={(event) => {
        if (dismissible && event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={[
          "absolute inset-y-0 right-0 z-dialog flex h-full w-full flex-col bg-surface shadow-pop animate-fade-in",
          widthClassName,
          "sm:rounded-l-modal",
          className ?? "",
        ].join(" ")}
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-4 py-3">
          <h2 id={titleId} className="t-h3 text-ink">
            {title}
          </h2>
          {dismissible && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Đóng"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-muted transition-colors hover:bg-surface-subtle hover:text-ink"
            >
              <XIcon />
            </button>
          )}
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 lg:p-6">{children}</div>
        {footer !== undefined && (
          <footer className="shrink-0 border-t border-line bg-surface p-4">
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{footer}</div>
          </footer>
        )}
      </div>
    </div>
  );
}
