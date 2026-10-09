import { useState } from "react";
import type { ReactNode } from "react";
import { Button, Icon } from "@/components/common";
import { useAdminParams } from "../../../hooks/useAdminParams";

/** Filter bar: stacked on mobile, one wrapping row on desktop. */
export function AdminToolbar({ children }: { children: ReactNode }) {
  return (
    <div className="rm-admin-toolbar mb-4 flex flex-col gap-3 rounded-xl bg-page/70 p-4 sm:flex-row sm:flex-wrap sm:items-end">
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
    <div className={`min-w-0 flex flex-col gap-1.5 ${className ?? ""}`}>
      <label htmlFor={htmlFor} className="t-label text-ink">
        {label}
      </label>
      {children}
    </div>
  );
}

/** Less frequent filters stay available without crowding the primary toolbar. */
export function AdminAdvancedFilters({ children, fields }: { children: ReactNode; fields: string[] }) {
  const { params, apply } = useAdminParams();
  const count = fields.filter(field => params.has(field)).length;
  const [open, setOpen] = useState(count > 0);
  return <details open={open} onToggle={event => setOpen(event.currentTarget.open)} className="w-full border-t border-line pt-3"><summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm font-medium text-muted hover:text-brand"><Icon name="filter" size={18} />Bộ lọc nâng cao{count > 0 && <span className="rounded-full bg-brand-soft px-2 text-xs text-brand">{count}</span>}<Icon name={open ? "chevron-left" : "chevron-right"} size={16} className="ml-auto" /></summary><div className="flex flex-col gap-3 pt-3 sm:flex-row sm:flex-wrap sm:items-end">{children}{count > 0 && <Button variant="ghost" onClick={() => apply(Object.fromEntries(fields.map(field => [field, null])))}>Xóa bộ lọc nâng cao</Button>}</div></details>;
}
