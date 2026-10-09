import { useEffect, useId, useRef } from "react";
import type { ReactNode, RefObject } from "react";
import { Button } from "../Button/Button";
import { FormField } from "../FormField/FormField";
import { Textarea } from "../Input/Input";
import { XIcon } from "../Icon/Icon";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

function getFocusable(container: HTMLElement | null): HTMLElement[] {
  if (!container) return [];
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => element.getClientRects().length > 0,
  );
}

export interface DialogBehaviorOptions {
  open: boolean;
  onClose: () => void;
  /** False while a mutation must not be interrupted (ui-spec 4). */
  dismissible: boolean;
  panelRef: RefObject<HTMLElement | null>;
  initialFocusRef?: RefObject<HTMLElement | null>;
}

/**
 * Shared modal behaviour: Escape, Tab cycling inside the panel, body scroll
 * lock and focus returned to the element that opened the dialog.
 */
export function useDialogBehavior({
  open,
  onClose,
  dismissible,
  panelRef,
  initialFocusRef,
}: DialogBehaviorOptions) {
  // Refs instead of effect deps: toggling `loading` must not restart the
  // effect, or focus would jump back to the opener mid-mutation.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const dismissibleRef = useRef(dismissible);
  dismissibleRef.current = dismissible;

  useEffect(() => {
    if (!open) return;

    const body = document.body;
    const previousOverflow = body.style.overflow;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    body.style.overflow = "hidden";

    const focusInitial = () => {
      const target =
        initialFocusRef?.current ?? getFocusable(panelRef.current)[0] ?? panelRef.current;
      target?.focus();
    };
    focusInitial();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && dismissibleRef.current) {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusables = getFocusable(panel);
      if (focusables.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (!first || !last) return;
      const active = document.activeElement;
      if (event.shiftKey) {
        if (active === first || !panel.contains(active)) {
          event.preventDefault();
          last.focus();
        }
      } else if (active === last || !panel.contains(active)) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [open, panelRef, initialFocusRef]);
}

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  /** Required: it labels the dialog through aria-labelledby. */
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  dismissible?: boolean;
  /** Element to focus first; defaults to the first focusable in the panel. */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** id of the text summarising the dialog, linked as aria-describedby. */
  describedBy?: string;
  className?: string;
}

export function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
  dismissible = true,
  initialFocusRef,
  describedBy,
  className,
}: DialogProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();

  useDialogBehavior({ open, onClose, dismissible, panelRef, initialFocusRef });

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-overlay flex items-center justify-center overflow-y-auto bg-ink/40 p-4 animate-fade-in"
      onClick={(event) => {
        if (dismissible && event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={describedBy}
        tabIndex={-1}
        className={[
          "relative z-dialog max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-modal bg-surface shadow-pop animate-fade-in",
          className ?? "",
        ].join(" ")}
      >
        <div className="flex items-start justify-between gap-3 px-4 pt-4 sm:px-6 sm:pt-6">
          <h2 id={titleId} className="t-h3 text-ink">
            {title}
          </h2>
          {dismissible && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Đóng hộp thoại"
              className="-mr-2 -mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-muted transition-colors hover:bg-surface-subtle hover:text-ink"
            >
              <XIcon />
            </button>
          )}
        </div>
        <div className="px-4 pb-4 pt-3 sm:px-6 sm:pb-6">{children}</div>
        {footer !== undefined && (
          <div className="flex flex-col-reverse gap-2 border-t border-line p-4 sm:flex-row sm:justify-end">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export interface ConfirmReasonField {
  label: string;
  required?: boolean;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  helper?: string;
  placeholder?: string;
}

export interface ConfirmDialogProps {
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "danger" | "primary";
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  reasonField?: ConfirmReasonField;
  /** Defaults to true so callers can mount the dialog only while confirming. */
  open?: boolean;
}

export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  cancelLabel = "Hủy",
  tone = "danger",
  loading = false,
  onConfirm,
  onCancel,
  reasonField,
  open = true,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const reasonRef = useRef<HTMLTextAreaElement | null>(null);
  const descriptionId = useId();
  const reasonId = useId();

  const reasonMissing =
    reasonField !== undefined && reasonField.required === true && reasonField.value.trim() === "";
  const confirmDisabled = loading || reasonMissing;

  return (
    <Dialog
      open={open}
      onClose={onCancel}
      dismissible={!loading}
      title={title}
      initialFocusRef={reasonField ? reasonRef : cancelRef}
      describedBy={description !== undefined ? descriptionId : undefined}
      footer={
        <>
          <Button ref={cancelRef} variant="secondary" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            variant={tone === "danger" ? "danger" : "primary"}
            onClick={onConfirm}
            loading={loading}
            disabled={confirmDisabled}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {description !== undefined && (
        <p id={descriptionId} className="t-body text-muted">
          {description}
        </p>
      )}
      {reasonField !== undefined && (
        <div className="mt-4">
          <FormField
            label={reasonField.label}
            required={reasonField.required}
            htmlFor={reasonId}
            helper={reasonField.helper}
            error={reasonField.error}
          >
            <Textarea
              ref={reasonRef}
              id={reasonId}
              value={reasonField.value}
              placeholder={reasonField.placeholder}
              rows={3}
              onChange={(event) => reasonField.onChange(event.target.value)}
            />
          </FormField>
        </div>
      )}
    </Dialog>
  );
}
