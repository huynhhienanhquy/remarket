export function OrderTimelineSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="flex gap-3">
          <div className="h-8 w-8 shrink-0 rounded-full bg-surface-subtle" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-1/4 bg-surface-subtle rounded-control" />
            <div className="h-4 w-1/2 bg-surface-subtle rounded-control" />
          </div>
        </div>
      ))}
    </div>
  );
}
