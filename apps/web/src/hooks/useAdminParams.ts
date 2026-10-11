import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";

export interface AdminParams {
  params: URLSearchParams;
  /** Filter changes reset pagination; drawer state preserves the current page. */
  apply: (patch: Record<string, string | null>, options?: { replace?: boolean }) => void;
}

/** URL query state so back/forward and refresh restore filters (ui-spec 1). */
export function useAdminParams(): AdminParams {
  const [searchParams, setSearchParams] = useSearchParams();

  const apply = useCallback<AdminParams["apply"]>(
    (patch, options) => {
      const next = new URLSearchParams(searchParams);
      let filterChanged = false;
      for (const [key, value] of Object.entries(patch)) {
        if (!["page", "selected", "new"].includes(key) && next.get(key) !== (value || null)) {
          filterChanged = true;
        }
        if (value === null || value === "") next.delete(key);
        else next.set(key, value);
      }
      if (filterChanged && !("page" in patch)) next.delete("page");
      setSearchParams(next, { replace: options?.replace ?? false });
    },
    [searchParams, setSearchParams],
  );

  return { params: searchParams, apply };
}
