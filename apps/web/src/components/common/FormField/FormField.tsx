import { cloneElement, isValidElement } from "react";
import type { ReactElement, ReactNode } from "react";

/** Props FormField injects into its single control child. */
interface LinkedFieldProps {
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  "aria-required"?: boolean;
}

export interface FormFieldProps {
  label: string;
  htmlFor: string;
  required?: boolean;
  helper?: ReactNode;
  /** Presence switches the field into its error state (ui-spec 4). */
  error?: ReactNode;
  children: ReactNode;
  className?: string;
}

function linkChild(
  child: ReactNode,
  describedBy: string | undefined,
  error: boolean,
  required: boolean,
): ReactNode {
  if (!isValidElement(child)) return child;
  const element = child as ReactElement<LinkedFieldProps>;
  const props = element.props;
  const described = [props["aria-describedby"], describedBy]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join(" ");
  return cloneElement(element, {
    "aria-describedby": described.length > 0 ? described : undefined,
    "aria-invalid": error ? true : props["aria-invalid"],
    "aria-required": required ? true : props["aria-required"],
  });
}

export function FormField({
  label,
  htmlFor,
  required = false,
  helper,
  error,
  children,
  className,
}: FormFieldProps) {
  const helperId = helper !== undefined && helper !== null ? `${htmlFor}-helper` : undefined;
  const errorId = error !== undefined && error !== null && error !== "" ? `${htmlFor}-error` : undefined;
  const describedBy = [helperId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={`flex flex-col gap-1.5 ${className ?? ""}`}>
      <label htmlFor={htmlFor} className="t-label text-ink">
        {label}
        {required && (
          <span className="text-danger" aria-hidden="true">
            {" *"}
          </span>
        )}
      </label>
      {linkChild(children, describedBy, errorId !== undefined, required)}
      {helperId && (
        <p id={helperId} className="t-meta text-muted">
          {helper}
        </p>
      )}
      {errorId && (
        <p id={errorId} className="t-meta text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
