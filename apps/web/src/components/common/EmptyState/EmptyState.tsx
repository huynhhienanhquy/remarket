import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { buttonClasses } from "../Button/Button";
import { InboxIcon } from "../Icon/Icon";

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
        {icon ?? <InboxIcon size={32} />}
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
