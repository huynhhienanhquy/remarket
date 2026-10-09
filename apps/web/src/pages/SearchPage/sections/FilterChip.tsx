/** Chip describing one active filter, with a direct remove control. */
export function FilterChip({
  label,
  onRemove,
}: {
  label: string;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-3 py-1 t-meta text-brand">
      {label}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Xóa bộ lọc ${label}`}
        className="flex h-5 w-5 items-center justify-center rounded-full hover:bg-brand hover:text-white"
      >
        ×
      </button>
    </span>
  );
}
