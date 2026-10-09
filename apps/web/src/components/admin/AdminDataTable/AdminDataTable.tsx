import { DataTable } from "@/components/common";
import type { DataTableProps } from "@/components/common";

/** One table DOM: labeled cards on phones and a regular table on larger screens. */
export function AdminDataTable<T>(props: DataTableProps<T>) {
  const columns = props.columns.map(column => ({ ...column, render: (row: T) => {
    const raw = row[column.key];
    const content = column.render ? column.render(row) : typeof raw === "string" || typeof raw === "number" || typeof raw === "bigint" ? String(raw) : null;
    return <div className={`rm-admin-cell min-w-0 ${column.key === "comment" || column.key === "target_label" ? "rm-admin-cell-wide" : ""}`}><span className="mb-1 block text-xs text-muted sm:hidden">{column.header}</span><div className="min-w-0">{content}</div></div>;
  } }));
  return <DataTable {...props} columns={columns} className={`rm-admin-table ${props.className ?? ""}`} />;
}
