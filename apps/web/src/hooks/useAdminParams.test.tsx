import { renderHook, act } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { useAdminParams } from "./useAdminParams";

describe("admin URL state", () => {
  function wrapper({ children }: { children: ReactNode }) {
    return <MemoryRouter initialEntries={["/admin/products?page=3&status=PENDING"]}>{children}</MemoryRouter>;
  }
  it("preserves page 3 when opening and closing a drawer", () => {
    const { result } = renderHook(useAdminParams, { wrapper });
    act(() => result.current.apply({ selected: "product-on-page-3" }));
    expect(result.current.params.get("page")).toBe("3");
    act(() => result.current.apply({ selected: null }));
    expect(result.current.params.get("page")).toBe("3");
  });
  it("resets pagination only when a filter actually changes", () => {
    const { result } = renderHook(useAdminParams, { wrapper });
    act(() => result.current.apply({ status: "PENDING" }));
    expect(result.current.params.get("page")).toBe("3");
    act(() => result.current.apply({ status: "ACTIVE" }));
    expect(result.current.params.has("page")).toBe(false);
  });
});
