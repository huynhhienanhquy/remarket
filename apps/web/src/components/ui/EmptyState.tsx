import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { buttonClasses } from "./Button";

export interface EmptyStateAction {
  label: string;
  /** `to` renders a router link, otherwise a plain action button. */
  to?: string;
  onClick?: () => void;
}

export interface EmptyStateProps {
  /** Defaults to a monochrome inbox glyph. */
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  /** At most one CTA (ui-spec 4). */
  action?: EmptyStateAction;
  className?: string;
}

function DefaultIcon() {
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M22 12h-6l-2 3h-4l-2-3H2" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </svg>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={`mx-auto flex max-w-md flex-col items-center gap-3 px-4 py-10 text-center ${className ?? ""}`}
    >
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-subtle text-muted">
        {icon ?? <DefaultIcon />}
      </span>
      <h2 className="t-h2 text-ink">{title}</h2>
      {description && <p className="t-body text-muted">{description}</p>}
      {action && (
        <div className="mt-1">
          {action.to !== undefined ? (
            <Link to={action.to} className={buttonClasses("primary", "md")}>
              {action.label}
            </Link>
          ) : (
            <button
              type="button"
              onClick={action.onClick}
              className={buttonClasses("primary", "md")}
            >
              {action.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
