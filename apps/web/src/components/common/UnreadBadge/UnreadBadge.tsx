/** Uses the real count; keeps the full count accessible when display caps at 99+. */
export function UnreadBadge({ count, label }: { count: number; label: string }) {
  if (count <= 0) return null;
  return (
    <span
      aria-label={`${label}: ${count} chưa đọc`}
      className="absolute -right-1.5 -top-1.5 min-w-[18px] rounded-full bg-danger px-1 text-center text-[11px] font-semibold leading-[18px] text-white"
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
