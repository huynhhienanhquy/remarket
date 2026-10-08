import type { ReactNode } from "react";

export interface SectionCardProps {
  title?: ReactNode;
  /** Right side of the header (buttons, tabs, small meta). */
  actions?: ReactNode;
  children: ReactNode;
  /** Footer action row; rendered only when provided. */
  footer?: ReactNode;
  className?: string;
  bodyClassName?: string;
}

export function SectionCard({
  title,
  actions,
  children,
  footer,
  className,
  bodyClassName,
}: SectionCardProps) {
  return (
    <section
      className={['rounded-card border border-line bg-surface', className ?? ""].join(" ")}
    >
      {(title !== undefined || actions !== undefined) && (
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 lg:px-6">
          {title !== undefined && <h2 className="t-h3 text-ink">{title}</h2>}
          {actions !== undefined && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={['p-4 lg:p-6', bodyClassName ?? ""].join(" ")}>{children}</div>
      {footer !== undefined && (
        <div className="flex flex-col gap-2 border-t border-line p-4 sm:flex-row sm:justify-end">
          {footer}
        </div>
      )}
    </section>
  );
}
