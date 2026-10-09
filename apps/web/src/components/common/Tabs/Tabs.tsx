import { useRef } from "react";
import type { KeyboardEvent, ReactNode } from "react";

export interface TabItem {
  value: string;
  label: ReactNode;
}

export interface TabsProps {
  tabs: TabItem[];
  value: string;
  onChange: (value: string) => void;
  ariaLabel?: string;
  className?: string;
}

export function Tabs({
  tabs,
  value,
  onChange,
  ariaLabel = "Điều hướng tab",
  className,
}: TabsProps) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const hasActive = tabs.some((tab) => tab.value === value);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const currentIndex = tabs.findIndex((tab) => tab.value === value);
    const from = currentIndex === -1 ? 0 : currentIndex;
    let next: number | null = null;
    if (event.key === "ArrowRight") next = (from + 1) % tabs.length;
    else if (event.key === "ArrowLeft") next = (from - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    if (next === null) return;
    const tab = tabs[next];
    if (!tab) return;
    event.preventDefault();
    onChange(tab.value);
    refs.current[next]?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={handleKeyDown}
      className={[
        "flex gap-1 overflow-x-auto border-b border-line scrollbar-thin",
        className ?? "",
      ].join(" ")}
    >
      {tabs.map((tab, index) => {
        const active = tab.value === value;
        return (
          <button
            key={tab.value}
            ref={(node) => {
              refs.current[index] = node;
            }}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active || (!hasActive && index === 0) ? 0 : -1}
            onClick={() => onChange(tab.value)}
            className={[
              "-mb-px shrink-0 whitespace-nowrap border-b-2 px-4 py-3 text-sm transition-colors",
              active
                ? "border-brand font-semibold text-brand"
                : "border-transparent font-medium text-muted hover:text-ink",
            ].join(" ")}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
