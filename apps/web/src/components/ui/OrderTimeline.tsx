import { formatDateTime } from "@remarket/shared";
import type { Tone } from "@remarket/shared";
import { CheckIcon } from "./icons";

export interface OrderTimelineStep {
  label: string;
  /** Matches the order status the caller is rendering; no step is invented. */
  status: string;
  done: boolean;
  /** ISO timestamp of the step, shown only when the API returned one. */
  at?: string;
  actor?: string | null;
  /** Defaults to brand; pass danger for a cancelled branch. */
  tone?: Tone;
}

export interface OrderTimelineProps {
  /** Caller supplies only the real steps of this order (ui-spec 4). */
  steps: OrderTimelineStep[];
  currentStatus: string;
  className?: string;
}

const DONE_BG: Record<Tone, string> = {
  brand: "bg-brand",
  info: "bg-info",
  warning: "bg-accent",
  danger: "bg-danger",
  neutral: "bg-muted",
};

export function OrderTimeline({ steps, currentStatus, className }: OrderTimelineProps) {
  return (
    <ol className={`flex flex-col ${className ?? ""}`}>
      {steps.map((step, index) => {
        const isCurrent = step.status === currentStatus;
        const tone = step.tone ?? "brand";
        const next = steps[index + 1];
        const meta = [step.actor, step.at ? formatDateTime(step.at) : null]
          .filter((value): value is string => Boolean(value))
          .join(" · ");

        return (
          <li
            key={`${step.status}-${index}`}
            aria-current={isCurrent ? "step" : undefined}
            className="flex gap-3"
          >
            <div className="flex flex-col items-center">
              <span
                className={[
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2",
                  step.done
                    ? `${DONE_BG[tone]} border-transparent text-white`
                    : isCurrent
                      ? "border-brand bg-surface text-brand"
                      : "border-line bg-surface-subtle text-muted",
                ].join(" ")}
              >
                {step.done ? (
                  <CheckIcon size={14} />
                ) : (
                  <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
                )}
              </span>
              {index < steps.length - 1 && (
                <span
                  aria-hidden="true"
                  className={`mt-1 w-0.5 flex-1 ${next?.done ? "bg-brand" : "bg-line"}`}
                />
              )}
            </div>
            <div className={`min-w-0 flex-1 ${index < steps.length - 1 ? "pb-6" : ""}`}>
              <p
                className={[
                  "text-sm",
                  step.done ? "font-semibold text-ink" : "font-medium text-muted",
                ].join(" ")}
              >
                {step.label}
              </p>
              {meta && <p className="t-meta mt-0.5 text-muted">{meta}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
