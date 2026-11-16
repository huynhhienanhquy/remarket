import { useState } from "react";
import type { ReactNode } from "react";
import { Button } from "../../common/Button/Button";
import { Icon } from "../../common/Icon/Icon";
import { useAdminParams } from "../../../hooks/useAdminParams";

/** Filter bar: stacked on mobile, one wrapping row on desktop. */
export function AdminToolbar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={["admin-toolbar", className].filter(Boolean).join(" ")}>
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
    <div className={`admin-toolbar-field ${className ?? ""}`}>
      <label htmlFor={htmlFor}>
        {label}
      </label>
      {children}
    </div>
  );
}

/** Less frequent filters stay available without crowding the primary toolbar. */
export function AdminAdvancedFilters({ children, fields, summary, open: controlledOpen, onOpenChange }: {
  children: ReactNode;
  fields: string[];
  summary?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const { params, apply } = useAdminParams();
  const count = fields.filter(field => params.has(field)).length;
  const [open, setOpen] = useState(count > 0);
  return (
    <details open={controlledOpen ?? open} onToggle={event => {
      setOpen(event.currentTarget.open);
      onOpenChange?.(event.currentTarget.open);
    }} className="admin-advanced">
      <summary>
        <Icon name="sliders" size={17} />Bộ lọc nâng cao
        {count > 0 && <span className="admin-pill" data-tone="brand">{count}</span>}
        <Icon name="chevron-right" size={15} className={`admin-advanced-chevron ${summary ? "" : "ml-auto"}`} />
        {summary && <span className="ml-auto hidden text-xs sm:inline">{summary}</span>}
      </summary>
      <div className="flex flex-col gap-3 pt-3 sm:flex-row sm:flex-wrap sm:items-end">
        {children}
        {count > 0 && <Button variant="ghost" onClick={() => apply(Object.fromEntries(fields.map(field => [field, null])))}>Xóa bộ lọc nâng cao</Button>}
      </div>
    </details>
  );
}
