import type { ReactNode } from "react";
import { Skeleton } from "./Skeleton";

export interface DataTableColumn<T> {
  key: keyof T & string;
  header: ReactNode;
  /** Custom cell; falls back to the raw value at `key`. */
  render?: (row: T) => ReactNode;
  width?: string;
  hideOnMobile?: boolean;
}

export interface DataTableProps<T> {
  columns: Array<DataTableColumn<T>>;
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  /** Skeleton rows drawn while loading. */
  loadingRows?: number;
  /** Rendered when there is nothing to show. */
  empty?: ReactNode;
  /**
   * Pointer convenience: the row is focusable and activates on Enter/Space,
   * but keyboard users should still reach the real link rendered in a cell.
   */
  onRowClick?: (row: T) => void;
  stickyHeader?: boolean;
  className?: string;
}

function toCell(value: unknown): ReactNode {
  if (value === null || value === undefined || typeof value === "boolean") return null;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  return null;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading = false,
  loadingRows = 5,
  empty,
  onRowClick,
  stickyHeader = true,
  className,
}: DataTableProps<T>) {
  const headerCells = columns.map((column) => (
    <th
      key={column.key}
      scope="col"
      style={column.width ? { width: column.width } : undefined}
      className={[
        "t-label px-4 py-3 text-left text-muted",
        stickyHeader ? "sticky top-0 z-10 bg-surface" : "",
        column.hideOnMobile ? "hidden sm:table-cell" : "",
      ].join(" ")}
    >
      {column.header}
    </th>
  ));

  return (
    <div
      aria-busy={loading}
      className={`w-full overflow-x-auto ${className ?? ""}`}
    >
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-line">{headerCells}</tr>
        </thead>
        <tbody>
          {loading &&
            Array.from({ length: loadingRows }, (_, rowIndex) => (
              <tr key={`skeleton-${rowIndex}`} className="border-b border-line">
                {columns.map((column) => (
                  <td key={column.key} className="px-4 py-3">
                    <Skeleton h="20px" />
                  </td>
                ))}
              </tr>
            ))}
          {!loading && rows.length === 0 && empty !== undefined && (
            <tr>
              <td colSpan={columns.length} className="px-4 py-10 text-center">
                {empty}
              </td>
            </tr>
          )}
          {!loading &&
            rows.map((row) => (
              <tr
                key={rowKey(row)}
                tabIndex={onRowClick ? 0 : undefined}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                onKeyDown={
                  onRowClick
                    ? (event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          onRowClick(row);
                        }
                      }
                    : undefined
                }
                className={[
                  "border-b border-line transition-colors",
                  onRowClick ? "cursor-pointer hover:bg-surface-subtle" : "",
                ].join(" ")}
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={[
                      "px-4 py-3 align-middle",
                      column.hideOnMobile ? "hidden sm:table-cell" : "",
                    ].join(" ")}
                  >
                    {column.render ? column.render(row) : toCell(row[column.key])}
                  </td>
                ))}
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}
