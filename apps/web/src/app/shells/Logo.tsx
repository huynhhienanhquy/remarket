import { Link } from "react-router-dom";

/** Text mark used everywhere a logo is required; no external asset needed. */
export function Logo({ to = "/", compact = false }: { to?: string; compact?: boolean }) {
  return (
    <Link
      to={to}
      aria-label="ReMarket — Trang chủ"
      className="flex shrink-0 items-center gap-2"
    >
      <span
        aria-hidden="true"
        className="grid h-8 w-8 place-items-center rounded-control bg-brand text-sm font-bold text-white"
      >
        R
      </span>
      {!compact && <span className="t-h3 text-ink">ReMarket</span>}
    </Link>
  );
}
