import { waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProductFormPage } from "@/pages/ProductFormPage/ProductFormPage";
import { httpContext } from "@/tests/http-context";
import { member, product } from "@/tests/test-data";
import { createMemberPageHarness } from "@/tests/renderMemberPage";

let context: ReturnType<typeof httpContext>;
const harness = createMemberPageHarness();
const show = harness.show;
beforeEach(() => { context = httpContext({ ...member }); context.reply("GET", "/products/" + product.id, product); });
afterEach(() => { harness.cleanup(); vi.unstubAllGlobals(); });

describe("member workflows through the HTTP adapter", () => {
it("loads canonical Hồ Chí Minh codes from the API only once", async () => {
    show(<ProductFormPage />, "/account/products/new");
    await waitFor(() => expect(document.querySelector('option[value="VN-52"]')).toBeInTheDocument());
    expect(document.querySelector('option[value="VN-65"]')).not.toBeInTheDocument();
    expect(context.requests("GET", "/provinces")).toHaveLength(1);
  });
});
