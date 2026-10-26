import { NavLink } from "react-router-dom";
import { Icon } from "../common";
import { ACCOUNT_GROUPS } from "../../config/route/accountNavigation";

export function AccountLinks({ onNavigate }: { onNavigate?: () => void }) {
  return <div className="space-y-5">
    {ACCOUNT_GROUPS.map((group) => <div key={group.title}>
      <h2 className="px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">{group.title}</h2>
      <ul className="mt-2 space-y-1">
        {group.items.map((item) => <li key={item.to}>
          <NavLink to={item.to} end={item.end} onClick={onNavigate} className={({ isActive }) => [
            "group flex min-h-[44px] items-center gap-3 rounded-xl px-3 py-2.5 text-sm leading-5 transition-colors",
            isActive ? "bg-brand font-semibold text-white" : "font-medium text-muted hover:bg-surface-subtle hover:text-ink",
          ].join(" ")}>
            <Icon name={item.icon} className="shrink-0" />
            <span className="flex-1">{item.label}</span>
            <Icon name="chevron-right" size={16} className="shrink-0 opacity-50" />
          </NavLink>
        </li>)}
      </ul>
    </div>)}
  </div>;
}
