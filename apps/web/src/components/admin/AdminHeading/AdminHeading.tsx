import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { Icon } from "@/components/common";
import { ADMIN_NAVIGATION } from "@/config/route/adminNavigation";

export function AdminHeading({
  title,
  description,
  actions,
}: {
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  const location = useLocation();
  const icon = ADMIN_NAVIGATION.find(item => item.to === location.pathname)?.icon ?? "home";
  return (
    <div className="mb-6 flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5 shadow-subtle sm:flex-row sm:items-center sm:justify-between sm:p-6">
      <div className="flex min-w-0 items-start gap-4"><span className="hidden h-12 w-12 shrink-0 place-items-center rounded-2xl bg-brand-soft text-brand sm:grid"><Icon name={icon} size={24} /></span><div className="min-w-0"><h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1><p className="mt-2 text-sm leading-6 text-muted">{description}</p></div></div>
      {actions && <div className="shrink-0">{actions}</div>}
    </div>
  );
}
