import { ProfileForm } from "./sections/ProfileForm";
import { Link } from "react-router-dom";
import { useSession } from "../../contexts/SessionContext";
import { InlineAlert } from "../../components/common/InlineAlert/InlineAlert";
import { AccountPageHeader } from "../../components/AccountPageHeader/AccountPageHeader";
import { Icon } from "../../components/common/Icon/Icon";
import { ACCOUNT_ITEMS } from "../../config/route/accountNavigation";

const shortcuts = ACCOUNT_ITEMS.filter(({ to }) => ["/orders", "/account/products", "/sales"].includes(to));

export function AccountPage() {
  const { viewer } = useSession();
  if (!viewer) return null;
  return (
    <div className="space-y-5 sm:space-y-6">
      <AccountPageHeader title="Hồ sơ cá nhân" description={`Chào ${viewer.full_name}, bạn có thể cập nhật hồ sơ và quản lý hoạt động mua bán tại đây.`} />
      {viewer.status === "LOCKED" ? (
        <InlineAlert tone="warning" title="Tài khoản đang bị hạn chế">
          <Link to="/support" className="text-brand">Liên hệ hỗ trợ</Link>
        </InlineAlert>
      ) : (
        <>
          <nav aria-label="Hoạt động mua bán" className="grid grid-cols-3 gap-2 sm:gap-3">
            {shortcuts.map(({ to, label, icon }) => (
              <Link key={to} to={to} className="rm-card-nav grid min-w-0 rounded-2xl">
                <span className="rm-account-card rm-card-face flex min-h-touch min-w-0 flex-col items-center gap-2 p-2 text-center text-xs font-semibold text-ink sm:flex-row sm:gap-3 sm:p-3 sm:text-left sm:text-sm">
                  <span className="rm-card-icon grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand"><Icon name={icon} size={18} /></span>
                  <span className="rm-card-layer min-w-0 flex-1">{label}</span>
                  <Icon name="chevron-right" size={16} className="rm-icon-forward hidden shrink-0 text-muted sm:block" />
                </span>
              </Link>
            ))}
          </nav>
          <ProfileForm key={viewer.id} viewer={viewer} />
        </>
      )}
    </div>
  );
}
