import { Link } from "react-router-dom";

/** The circular arrows and two-tone wordmark match the native header. */
export function Logo({ to = "/", compact = false }: { to?: string; compact?: boolean }) {
  return (
    <Link
      to={to}
      aria-label="ReMarket — Trang chủ"
      className="inline-flex min-h-touch shrink-0 items-center gap-2"
    >
      <span
        aria-hidden="true"
        className="grid h-8 w-8 place-items-center rounded-control bg-brand text-white"
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 10a8 8 0 0 0-13.7-4.6L4 8m0-4v4h4M4 14a8 8 0 0 0 13.7 4.6L20 16m0 4v-4h-4" />
        </svg>
      </span>
      {!compact && <span className="text-lg font-bold tracking-tight text-ink">Re<span className="text-brand">Market</span></span>}
    </Link>
  );
}
