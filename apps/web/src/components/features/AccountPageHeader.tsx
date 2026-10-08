import type { ReactNode } from "react";
import { EmptyState, Icon } from "../ui";
import type { EmptyStateProps, IconName } from "../ui";
import { ACCOUNT_ITEMS } from "./AccountNavigation";

export function AccountPageHeader({ title, description, action }: {
  title: string;
  description: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="rm-account-heading flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
      <div className="flex min-w-0 items-start gap-4">
        <span className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-soft text-brand sm:flex">
          <Icon name={ACCOUNT_ITEMS.find((item) => item.label === title)?.icon ?? "user"} size={24} />
        </span>
        <div className="min-w-0">
          <h1 className="t-h1 text-ink">{title}</h1>
          <p className="mt-2 max-w-[560px] text-sm leading-6 text-muted">{description}</p>
        </div>
      </div>
      {action && <div className="rm-account-heading-action shrink-0">{action}</div>}
    </div>
  );
}

export function AccountFilters({ options, value, onChange, label = "Lọc theo trạng thái" }: {
  options: readonly { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  label?: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2 rounded-2xl border border-line bg-surface p-3 shadow-subtle">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={[
            "min-h-[44px] rounded-xl border px-4 py-2 text-sm leading-5 transition-colors",
            value === option.value
              ? "border-brand bg-brand font-semibold text-white"
              : "border-transparent bg-surface font-medium text-muted hover:bg-surface-subtle hover:text-ink",
          ].join(" ")}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function AccountEmptyState({ icon = "inbox", ...props }: Omit<EmptyStateProps, "icon"> & { icon?: IconName }) {
  return <div className="rm-account-card flex min-h-[300px] items-center justify-center sm:min-h-[340px]">
    <EmptyState {...props} icon={<Icon name={icon} size={28} />} className={`rm-account-empty ${props.className ?? ""}`} />
  </div>;
}
