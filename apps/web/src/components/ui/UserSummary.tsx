import { Link } from "react-router-dom";
import type { SellerSummary } from "@remarket/shared";
import { ApiImage } from "./ApiImage";

export interface UserSummaryProps {
  user: SellerSummary;
  size: "md" | "lg";
  /** Default true; pass false where the viewer cannot open public profiles. */
  linkToProfile?: boolean;
  className?: string;
}

/** Vietnamese decimal separator: 4.8 -> "4,8" (ui-spec 5). */
function ratingText(user: SellerSummary): string {
  if (user.rating === null) return "Chưa có đánh giá";
  return `${String(user.rating).replace(".", ",")}/5 · ${user.review_count} đánh giá`;
}

export function UserSummary({
  user,
  size,
  linkToProfile = true,
  className,
}: UserSummaryProps) {
  const avatarSize = size === "lg" ? "h-12 w-12 text-lg" : "h-10 w-10 text-base";

  return (
    <div className={`flex items-center gap-3 ${className ?? ""}`}>
      {user.avatar_url ? (
        <ApiImage
          src={user.avatar_url}
          alt=""
          aria-hidden="true"
          className={`${avatarSize} shrink-0 rounded-full object-cover`}
        />
      ) : (
        <span
          aria-hidden="true"
          className={`${avatarSize} flex shrink-0 items-center justify-center rounded-full bg-brand-soft font-semibold text-brand`}
        >
          {user.name.trim().charAt(0).toUpperCase()}
        </span>
      )}
      <div className="min-w-0">
        {linkToProfile ? (
          <Link
            to={`/users/${user.id}`}
            className="t-label block truncate text-ink hover:text-brand"
          >
            {user.name}
          </Link>
        ) : (
          <p className="t-label truncate text-ink">{user.name}</p>
        )}
        <p className="t-meta text-muted">{ratingText(user)}</p>
        <p className="t-meta text-muted">{user.completed_sales_count} đơn bán hoàn tất</p>
      </div>
    </div>
  );
}
