export interface SkeletonProps {
  /** Any CSS length; kept as inline style so Tailwind never purges it. */
  w?: string;
  h?: string;
  radius?: string;
  className?: string;
}

export function Skeleton({ w, h, radius, className }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={`rm-skeleton ${className ?? ""}`}
      style={{ width: w, height: h, borderRadius: radius }}
    />
  );
}

/** Same geometry as ProductCard: 4:3 image, two title lines, price, footer. */
export function ProductCardSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="h-full overflow-hidden rounded-card border border-line bg-surface"
    >
      <div className="rm-skeleton aspect-[4/3] w-full rounded-none" />
      <div className="flex flex-col gap-2 p-3">
        <div className="rm-skeleton h-5 w-full" />
        <div className="rm-skeleton h-5 w-4/5" />
        <div className="rm-skeleton h-6 w-1/3" />
        <div className="rm-skeleton h-4 w-1/2" />
        <div className="mt-2 flex items-center justify-between gap-2">
          <div className="rm-skeleton h-4 w-24" />
          <div className="rm-skeleton h-4 w-16" />
        </div>
      </div>
    </div>
  );
}

export interface ListSkeletonProps {
  rows?: number;
  className?: string;
}

/** Row layout: 80px thumbnail plus three text lines (ui-spec 13). */
export function ListSkeleton({ rows = 5, className }: ListSkeletonProps) {
  return (
    <div aria-hidden="true" className={`flex flex-col gap-3 ${className ?? ""}`}>
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          className="flex items-center gap-3 rounded-card border border-line bg-surface p-3"
        >
          <div className="rm-skeleton h-16 w-20 shrink-0" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="rm-skeleton h-4 w-3/4" />
            <div className="rm-skeleton h-4 w-1/3" />
            <div className="rm-skeleton h-3 w-1/4" />
          </div>
          <div className="rm-skeleton hidden h-8 w-24 shrink-0 sm:block" />
        </div>
      ))}
    </div>
  );
}

export interface TableSkeletonProps {
  rows?: number;
  cols?: number;
  className?: string;
}

export function TableSkeleton({ rows = 5, cols = 4, className }: TableSkeletonProps) {
  const template = `repeat(${cols}, minmax(0, 1fr))`;
  return (
    <div aria-hidden="true" className={`overflow-hidden rounded-card border border-line bg-surface ${className ?? ""}`}>
      <div
        className="grid gap-4 border-b border-line bg-surface px-4 py-3"
        style={{ gridTemplateColumns: template }}
      >
        {Array.from({ length: cols }, (_, col) => (
          <div key={col} className="rm-skeleton h-4" />
        ))}
      </div>
      {Array.from({ length: rows }, (_, row) => (
        <div
          key={row}
          className="grid items-center gap-4 border-b border-line px-4 py-3 last:border-b-0"
          style={{ gridTemplateColumns: template }}
        >
          {Array.from({ length: cols }, (_, col) => (
            <div key={col} className="rm-skeleton h-4" />
          ))}
        </div>
      ))}
    </div>
  );
}

/** KPI tiles plus one queue list — the admin dashboard skeleton (ui-spec 23.1). */
export function DashboardSkeleton({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={`flex flex-col gap-6 ${className ?? ""}`}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <div
            key={index}
            className="rounded-card border border-line bg-surface p-4 lg:p-6"
          >
            <div className="rm-skeleton h-4 w-1/2" />
            <div className="rm-skeleton mt-3 h-8 w-1/3" />
          </div>
        ))}
      </div>
      <div className="rounded-card border border-line bg-surface p-4 lg:p-6">
        <div className="rm-skeleton h-5 w-1/3" />
        <div className="mt-4 flex flex-col gap-3">
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index} className="flex items-center gap-3">
              <div className="rm-skeleton h-10 w-10 shrink-0 rounded-full" />
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <div className="rm-skeleton h-4 w-2/3" />
                <div className="rm-skeleton h-3 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
