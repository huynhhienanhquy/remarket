import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { buttonClasses } from "../Button/Button";
import { InboxIcon } from "../Icon/Icon";

interface EmptyStateAction {
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
      <span className="flex h-16 w-16 items-center justify-center rounded-modal bg-brand-soft text-brand">
        {icon ?? <InboxIcon size={28} />}
      </span>
      <h2 className="t-h2 text-ink">{title}</h2>
      {description && <p className="text-sm leading-6 text-muted">{description}</p>}
      {action && (
        <div className="mt-1">
          {action.to !== undefined ? (
            <Link to={action.to} className={buttonClasses("primary", "md")}>
              <span className="rm-button-content inline-block">{action.label}</span>
            </Link>
          ) : (
            <button
              type="button"
              onClick={action.onClick}
              className={buttonClasses("primary", "md")}
            >
              <span className="rm-button-content inline-block">{action.label}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
