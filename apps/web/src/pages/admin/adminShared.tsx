import { useCallback } from "react";
import type { ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { Button, InlineAlert } from "../../components/ui";
import { errorTitle, isApiError } from "../../lib/errors";

/**
 * Shared building blocks for the eight admin screens (ui-spec 23):
 * heading, toolbar, URL-backed filter state, error/empty wiring and the
 * compact row action used by every table.
 */

export function AdminHeading({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="mb-5">
      <h1 className="t-h1 text-ink">{title}</h1>
      <p className="mt-1 t-body text-muted">{description}</p>
    </div>
  );
}

/** Filter bar: stacked on mobile, one wrapping row on desktop. */
export function AdminToolbar({ children }: { children: ReactNode }) {
  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
      {children}
    </div>
  );
}

/** Field wrapper for toolbar controls: label above the control. */
export function ToolbarField({
  label,
  htmlFor,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${className ?? ""}`}>
      <label htmlFor={htmlFor} className="t-label text-ink">
        {label}
      </label>
      {children}
    </div>
  );
}

/** 1-based page from the URL; anything malformed falls back to 1. */
export function readPage(params: URLSearchParams): number {
  const raw = params.get("page");
  const value = raw === null ? Number.NaN : Number(raw);
  return Number.isFinite(value) && value >= 1 ? Math.floor(value) : 1;
}

/** Reads an enum-ish param only when the value is one of `allowed`. */
export function readEnumParam<T extends string>(
  params: URLSearchParams,
  key: string,
  allowed: readonly T[],
): T | "" {
  const raw = params.get(key);
  if (raw === null) return "";
  return allowed.find((value) => value === raw) ?? "";
}

export interface AdminParams {
  params: URLSearchParams;
  /** Writes a patch; any change that is not `page` resets the page to 1. */
  apply: (patch: Record<string, string | null>, options?: { replace?: boolean }) => void;
}

/** URL query state so back/forward and refresh restore filters (ui-spec 1). */
export function useAdminParams(): AdminParams {
  const [searchParams, setSearchParams] = useSearchParams();

  const apply = useCallback<AdminParams["apply"]>(
    (patch, options) => {
      const next = new URLSearchParams(searchParams);
      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === "") next.delete(key);
        else next.set(key, value);
      }
      if (!("page" in patch)) next.delete("page");
      setSearchParams(next, { replace: options?.replace ?? false });
    },
    [searchParams, setSearchParams],
  );

  return { params: searchParams, apply };
}

/** Inline error with the mandatory "Tải lại" action (ui-spec 24). */
export function QueryErrorAlert({
  error,
  onRetry,
  title,
}: {
  error: unknown;
  onRetry: () => void;
  title?: string;
}) {
  const network = isApiError(error) && error.isNetwork;
  const requestId = isApiError(error) ? error.requestId : undefined;
  return (
    <InlineAlert
      tone="danger"
      title={title ?? errorTitle(error)}
      action={
        <Button variant="secondary" onClick={onRetry}>
          Tải lại
        </Button>
      }
    >
      {network
        ? "Không thể kết nối máy chủ. Vui lòng kiểm tra mạng và thử lại."
        : "Chưa tải được dữ liệu. Vui lòng thử lại."}
      {requestId ? ` Mã yêu cầu: ${requestId}` : null}
    </InlineAlert>
  );
}

/** Field message from a 422 response, or undefined for other failures. */
export function fieldError(error: unknown, field: string): string | undefined {
  if (!isApiError(error)) return undefined;
  return error.fields?.[field];
}

/** Description line for a toast raised from an ApiError. */
export function errorDescription(error: unknown): string | undefined {
  if (!isApiError(error)) return undefined;
  return error.message !== "" ? error.message : undefined;
}

export function isVersionConflict(error: unknown): boolean {
  return isApiError(error) && error.is("VERSION_CONFLICT");
}

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
    <span className="inline-flex" onClick={(event) => event.stopPropagation()}>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={[
          "inline-flex min-h-[44px] items-center rounded-control px-2.5 t-label transition-colors",
          "disabled:cursor-not-allowed disabled:opacity-50",
          ROW_ACTION_TONES[tone],
        ].join(" ")}
      >
        {children}
      </button>
    </span>
  );
}

/** "YYYY-MM-DD" in the local time zone, for date inputs. */
export function isoDay(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Default dashboard window: the last 30 days including today. */
export function last30Days(): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - 29);
  return { from: isoDay(from), to: isoDay(to) };
}


