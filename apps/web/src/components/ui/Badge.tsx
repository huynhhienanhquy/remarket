import type { Tone } from "@remarket/shared";

export interface BadgeProps {
  children: React.ReactNode;
  variant?: Tone;
  tone?: Tone;
  size?: "sm" | "md";
  className?: string;
}

export function Badge({ children, variant, tone, size = "md", className }: BadgeProps) {
  const resolvedTone: Tone = tone ?? variant ?? "neutral";
  const sizeClass = size === "sm" ? "px-1.5 py-0.5 text-[11px]" : "px-2 py-0.5 text-xs";

  const toneClasses: Record<Tone, string> = {
    brand: "bg-brand-soft text-brand",
    warning: "bg-warning-bg text-accent",
    danger: "bg-danger-bg text-danger",
    info: "bg-info-bg text-info",
    neutral: "bg-neutral-100 text-neutral-600",
  };

  return (
    <span
      className={[
        "inline-flex items-center whitespace-nowrap rounded-full font-medium",
        sizeClass,
        toneClasses[resolvedTone],
        className ?? "",
      ].join(" ")}
    >
      {children}
    </span>
  );
}
