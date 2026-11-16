import { useId } from "react";
import type { FormEvent } from "react";
import { SearchIcon, XIcon } from "../Icon/Icon";

export interface SearchInputProps {
  value: string;
  onValueChange: (value: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  /** Visible only to screen readers; ties the input to its group name. */
  label?: string;
  name?: string;
  className?: string;
}

const ICON_BUTTON =
  "flex h-touch w-touch shrink-0 items-center justify-center rounded-control transition-colors";

export function SearchInput({
  value,
  onValueChange,
  onSubmit,
  placeholder = "Bạn đang tìm món đồ gì?",
  label = "Tìm kiếm",
  name = "q",
  className,
}: SearchInputProps) {
  const inputId = useId();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit();
  }

  return (
    <form role="search" onSubmit={handleSubmit} className={`w-full ${className ?? ""}`}>
      <label htmlFor={inputId} className="sr-only">
        {label}
      </label>
      <div className="flex min-h-12 items-center gap-2 rounded-card border border-input-line bg-page py-px pl-3 pr-0.5 focus-within:border-brand">
        <SearchIcon className="pointer-events-none shrink-0 text-muted" />
        {/* The UA cancel button is hidden: the X below carries the
            "Xóa tìm kiếm" label and the 44px target (ui-spec 2.2). */}
        <input
          id={inputId}
          name={name}
          type="search"
          value={value}
          placeholder={placeholder}
          autoComplete="off"
          onChange={(event) => onValueChange(event.target.value)}
          className="min-h-touch min-w-0 flex-1 bg-transparent text-base text-ink placeholder:text-muted focus-visible:outline-offset-0 [&::-webkit-search-cancel-button]:appearance-none"
        />
        <div className="flex shrink-0 items-center">
          {value !== "" && (
            <button
              type="button"
              onClick={() => onValueChange("")}
              aria-label="Xóa tìm kiếm"
              className={[ICON_BUTTON, "text-muted hover:bg-surface-subtle hover:text-ink"].join(" ")}
            >
              <XIcon />
            </button>
          )}
          <button
            type="submit"
            aria-label="Tìm kiếm"
            className={[ICON_BUTTON, "bg-brand text-white hover:bg-brand-hover"].join(" ")}
          >
            <SearchIcon />
          </button>
        </div>
      </div>
    </form>
  );
}
