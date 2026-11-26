import { XIcon } from "../../../components/common/Icon/Icon";

export function FilterChip({
  label,
  onRemove,
}: {
  label: string;
  onRemove: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onRemove}
      aria-label={`Xóa bộ lọc ${label}`}
      className="inline-flex min-h-touch max-w-full items-center gap-2 rounded-full border border-brand/15 bg-brand-soft px-3 text-left text-sm text-brand hover:border-brand/50"
    >
      <span className="min-w-0 break-words">{label}</span>
      <XIcon size={14} className="shrink-0" />
    </button>
  );
}
