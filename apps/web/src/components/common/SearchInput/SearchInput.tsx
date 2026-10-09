import { useId } from "react";
import type { FormEvent } from "react";
import { inputClasses } from "../Input/Input";
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
  "flex h-11 w-11 shrink-0 items-center justify-center rounded-control transition-colors";

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
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
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
          className={[
            inputClasses(false),
            "pl-10 pr-28 [&::-webkit-search-cancel-button]:appearance-none",
          ].join(" ")}
        />
        <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-1">
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
