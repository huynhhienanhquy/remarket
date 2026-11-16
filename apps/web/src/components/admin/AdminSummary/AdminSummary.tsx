import type { ReactNode } from "react";
import type { Tone } from "@remarket/shared";
import { ApiImage } from "../../common/ApiImage/ApiImage";
import { Icon, type IconName } from "../../common/Icon/Icon";

const number = new Intl.NumberFormat("vi-VN");

export type AdminMetric = {
  label: string;
  value: number | string | undefined | null;
  icon: IconName;
  note?: ReactNode;
  unit?: string;
  badge?: ReactNode;
  tone?: Tone;
};

export function AdminMetrics({ metrics, columns = 4 }: { metrics: AdminMetric[]; columns?: 3 | 4 }) {
  return (
    <dl className="admin-metrics" data-columns={columns}>
      {metrics.map(({ label, value, icon, note, tone, unit, badge }) => (
        <div key={label} className="admin-panel admin-metric" data-tone={tone}>
          <div className="min-w-0 flex-1">
            <dt>{label}</dt>
            <dd>{typeof value === "number" ? number.format(value) : value ?? "—"}{value != null && unit && <span className="admin-metric-unit"> {unit}</span>}{badge}</dd>
            {note && <div className="admin-metric-note">{note}</div>}
          </div>
          <span className="admin-metric-icon"><Icon name={icon} size={18} /></span>
        </div>
      ))}
    </dl>
  );
}

export function AdminAvatar({ name, src, tone, small = false }: {
  name: string;
  src?: string | null;
  tone?: "outline" | "warning" | "solid";
  small?: boolean;
}) {
  return (
    <span className={small ? "admin-avatar admin-avatar-sm" : "admin-avatar"} data-tone={tone} aria-hidden="true">
      {src ? <ApiImage src={src} alt="" className="h-full w-full object-cover" /> : name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}

export function AdminPill({ children, tone, dot = false }: { children: ReactNode; tone?: Tone; dot?: boolean }) {
  return <span className="admin-pill" data-tone={tone} data-dot={dot || undefined}>{children}</span>;
}

export function AdminNotice({ title, children, icon = "shield", action }: {
  title: string;
  children: ReactNode;
  icon?: IconName;
  action?: ReactNode;
}) {
  return (
    <aside className="admin-notice">
      <Icon name={icon} size={20} />
      <div className="min-w-0 flex-1"><h2>{title}</h2><p>{children}</p></div>
      {action}
    </aside>
  );
}
