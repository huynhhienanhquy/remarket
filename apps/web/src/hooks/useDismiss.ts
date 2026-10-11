import { useEffect, useRef } from "react";
import type { RefObject } from "react";

export function useDismiss(open: boolean, containerRef: RefObject<HTMLElement | null>, onClose: () => void) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const outside = (event: MouseEvent) => {
      if (event.target instanceof Node && !containerRef.current?.contains(event.target)) closeRef.current();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) {
        event.preventDefault();
        closeRef.current();
        containerRef.current?.querySelector<HTMLElement>('[aria-haspopup="menu"]')?.focus();
      }
    };
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("mousedown", outside); document.removeEventListener("keydown", escape); };
  }, [open, containerRef]);
}
