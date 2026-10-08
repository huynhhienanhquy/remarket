/**
 * Date helpers. The interface shows Asia/Ho_Chi_Minh time (ui-spec 5) while
 * the API stores UTC ISO 8601 strings.
 */

const TZ = "Asia/Ho_Chi_Minh";

const dateTimeFormatter = new Intl.DateTimeFormat("vi-VN", {
  timeZone: TZ,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const dateFormatter = new Intl.DateTimeFormat("vi-VN", {
  timeZone: TZ,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

function parse(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "05/10/2026 14:30" — used for titles, tooltips and detail views. */
export function formatDateTime(iso: string | null | undefined): string {
  const date = parse(iso);
  return date ? dateTimeFormatter.format(date) : "—";
}

/** "05/10/2026". */
export function formatDate(iso: string | null | undefined): string {
  const date = parse(iso);
  return date ? dateFormatter.format(date) : "—";
}

/**
 * Short relative form for list metadata ("2 giờ trước"). Older than ~7 days
 * falls back to a short date so rows stay scannable.
 */
export function formatRelative(iso: string | null | undefined, now = new Date()): string {
  const date = parse(iso);
  if (!date) return "—";

  const diffMs = now.getTime() - date.getTime();
  if (diffMs < 0) return formatDateTime(iso);

  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "Vừa xong";
  if (minutes < 60) return `${minutes} phút trước`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} ngày trước`;

  return dateFormatter.format(date);
}

/** Countdown to a deadline such as an order's `expires_at`. */
export function formatRemaining(
  iso: string | null | undefined,
  now = new Date(),
): { expired: boolean; text: string } {
  const date = parse(iso);
  if (!date) return { expired: false, text: "—" };

  const diffMs = date.getTime() - now.getTime();
  if (diffMs <= 0) return { expired: true, text: "Đã quá hạn" };

  const totalMinutes = Math.floor(diffMs / 60_000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return { expired: false, text: `còn ${days} ngày ${hours} giờ` };
  if (hours > 0) return { expired: false, text: `còn ${hours} giờ ${minutes} phút` };
  return { expired: false, text: `còn ${minutes} phút` };
}

