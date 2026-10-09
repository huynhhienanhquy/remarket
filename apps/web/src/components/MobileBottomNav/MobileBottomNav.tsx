import { Link, useLocation } from "react-router-dom";
import { HeartIcon, HomeIcon, ChatIcon, PlusIcon, UserIcon } from "../common";
import { useSession } from "../../contexts/SessionContext";
import { loginPathFor } from "../../config/route/guards";
import { UnreadBadge } from "../common/UnreadBadge/UnreadBadge";
import { useUnreadMessageCount } from "../../hooks/useUnreadMessageCount";

interface Tab {
  to: string;
  label: string;
  icon: (props: { className?: string }) => React.ReactElement;
  match: (pathname: string) => boolean;
  authOnly?: boolean;
}

const TABS: Tab[] = [
  { to: "/", label: "Khám phá", icon: HomeIcon, match: (p) => p === "/" },
  { to: "/favorites", label: "Yêu thích", icon: HeartIcon, match: (p) => p.startsWith("/favorites"), authOnly: true },
  { to: "/account/products/new", label: "Đăng bán", icon: PlusIcon, match: (p) => p.startsWith("/account/products/new") },
  { to: "/messages", label: "Tin nhắn", icon: ChatIcon, match: (p) => p.startsWith("/messages"), authOnly: true },
  { to: "/account", label: "Tài khoản", icon: UserIcon, match: (p) => ["/account", "/cart", "/orders", "/sales", "/notifications", "/support"].some((prefix) => p === prefix || p.startsWith(`${prefix}/`)), authOnly: true },
];

/**
 * Bottom navigation for discovery pages (ui-spec 3). Hidden on product detail,
 * checkout, listing form, chat detail and order detail, which carry their own
 * action bar or composer.
 */
export function MobileBottomNav() {
  const location = useLocation();
  const { viewer } = useSession();
  const messages = useUnreadMessageCount();
  const pathname = location.pathname;

  const hidden =
    /^\/products\/[^/]+$/.test(pathname) ||
    pathname === "/checkout" ||
    /^\/account\/products\/(new|[^/]+\/edit)$/.test(pathname) ||
    /^\/messages\/[^/]+$/.test(pathname) ||
    /^\/(orders|sales)\/[^/]+$/.test(pathname);

  if (hidden) return null;

  const tabs = TABS.map((tab) => {
    if (!tab.authOnly || viewer) return tab;
    // Guests: protected tabs route to login with a safe return target.
    return { ...tab, to: loginPathFor(pathname, location.search) };
  });

  return (
    <nav
      aria-label="Điều hướng chính"
      className="rm-safe-bottom fixed inset-x-0 bottom-0 z-action-bar border-t border-line bg-surface lg:hidden"
    >
      <ul className="rm-container flex h-16 items-stretch justify-between">
        {tabs.map((tab) => {
          const active = tab.match(pathname) && (tab.authOnly !== true || viewer !== null);
          const Icon = tab.icon;
          const count = tab.label === "Tin nhắn" ? messages : 0;
          return (
            <li key={tab.label} className="flex-1">
              <Link
                to={tab.to}
                aria-current={active ? "page" : undefined}
                aria-label={count > 0 ? `${tab.label}: ${count} chưa đọc` : undefined}
                className={[
                  "flex h-full min-h-[44px] flex-col items-center justify-center gap-0.5 rounded-control py-1",
                  active ? "bg-brand-soft text-brand" : "text-muted",
                ].join(" ")}
              >
                <span className="relative">
                  <Icon className={active ? "text-brand" : "text-muted"} />
                  <UnreadBadge count={count} label={tab.label} />
                </span>
                <span
                  className={[
                    "text-[11px] leading-[14px]",
                    active ? "font-semibold text-brand" : "text-muted",
                  ].join(" ")}
                >
                  {tab.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
