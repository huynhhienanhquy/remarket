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
      <div className="p-3">
        <div className="grid h-10 content-center gap-1">
          <div className="rm-skeleton h-4 w-full" />
          <div className="rm-skeleton h-4 w-4/5" />
        </div>
        <div className="mt-1 rm-skeleton h-6 w-2/3" />
        <div className="mt-1 rm-skeleton h-[22px] w-12 rounded-full" />
        <div className="mt-2 flex items-center justify-between gap-2 border-t border-line pt-2">
          <div className="rm-skeleton h-[18px] w-2/5" />
          <div className="rm-skeleton h-[18px] w-1/3" />
        </div>
      </div>
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
