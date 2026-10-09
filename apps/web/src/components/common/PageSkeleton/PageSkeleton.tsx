import { Skeleton } from "..";

/**
 * Shell-level skeleton used while the first session check runs, so private
 * routes never flash Guest UI (ui-spec 24).
 */
export function PageSkeleton({ label = "Đang tải phiên làm việc…" }: { label?: string }) {
  return (
    <div className="min-h-screen bg-page" aria-busy="true" aria-live="polite">
      <span className="sr-only">{label}</span>
      <div className="h-20 border-b border-line bg-surface">
        <div className="rm-container flex h-full items-center gap-6">
          <Skeleton w="160px" h="32px" />
          <Skeleton className="max-w-[520px] flex-1" h="44px" />
          <Skeleton w="120px" h="32px" />
        </div>
      </div>
      <div className="rm-container py-8 lg:py-12">
        <Skeleton w="280px" h="32px" />
        <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} h="220px" radius="12px" />
          ))}
        </div>
      </div>
    </div>
  );
}
