import { UnreadBadge } from "@/components/common/UnreadBadge/UnreadBadge";
import { Link } from "react-router-dom";
import { useSession } from "@/contexts/SessionContext";

/* ------------------------------------------------------------------ */
/* Header                                                              */
/* ------------------------------------------------------------------ */
export function IconButton({
  to,
  label,
  children,
  badge,
  visibleWhenGuest = false,
}: {
  to: string;
  label: string;
  children: React.ReactNode;
  badge?: number;
  visibleWhenGuest?: boolean;
}) {
  const { viewer } = useSession();
  if (!viewer && !visibleWhenGuest) return null;
  return (
    <Link
      to={to}
      aria-label={badge && badge > 0 ? `${label}: ${badge} chưa đọc` : label}
      className="relative flex h-11 w-11 items-center justify-center rounded-control text-ink transition-colors hover:bg-surface-subtle"
    >
      {children}
      {badge !== undefined && <UnreadBadge count={badge} label={label} />}
    </Link>
  );
}
