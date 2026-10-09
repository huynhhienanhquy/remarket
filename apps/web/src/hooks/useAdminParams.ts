import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";

export interface AdminParams {
  params: URLSearchParams;
  /** Writes a patch; any change that is not `page` resets the page to 1. */
  apply: (patch: Record<string, string | null>, options?: { replace?: boolean }) => void;
}

/** URL query state so back/forward and refresh restore filters (ui-spec 1). */
export function useAdminParams(): AdminParams {
  const [searchParams, setSearchParams] = useSearchParams();

  const apply = useCallback<AdminParams["apply"]>(
    (patch, options) => {
      const next = new URLSearchParams(searchParams);
      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === "") next.delete(key);
        else next.set(key, value);
      }
      if (!("page" in patch)) next.delete("page");
      setSearchParams(next, { replace: options?.replace ?? false });
    },
    [searchParams, setSearchParams],
  );

  return { params: searchParams, apply };
}
