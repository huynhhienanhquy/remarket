import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { Icon } from "../../common/Icon/Icon";
import { ADMIN_NAVIGATION } from "@/config/route/adminNavigation";

export function AdminHeading({
  title,
  description,
  actions,
  badge,
}: {
  title: string;
  description: string;
  actions?: ReactNode;
  badge?: ReactNode;
}) {
  const location = useLocation();
  const icon = location.pathname === "/admin/support" ? "chat-square" : location.pathname === "/admin" ? "home" : ADMIN_NAVIGATION.find(item => item.to === location.pathname)?.icon ?? "home";
  return (
    <div className="admin-heading">
      <div className="admin-heading-copy">
        <span className="admin-heading-icon"><Icon name={icon} size={25} /></span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5"><h1>{title}</h1>{badge}</div>
          <p>{description}</p>
        </div>
      </div>
      {actions && <div className="admin-heading-actions">{actions}</div>}
    </div>
  );
}
