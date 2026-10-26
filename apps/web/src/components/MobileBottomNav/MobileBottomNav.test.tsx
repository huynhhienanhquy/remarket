import type { ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryClient } from "../../config/queryClient";
import { SessionProvider, useSession } from "../../contexts/SessionContext";
import { httpContext } from "../../tests/http-context";
import { member } from "../../tests/test-data";
import { MobileBottomNav } from "./MobileBottomNav";

let context: ReturnType<typeof httpContext>;
let client: ReturnType<typeof createQueryClient>;
function Ready({ children }: { children: ReactNode }) { return useSession().status === "ready" ? children : null; }
function Location() { const location = useLocation(); return <output data-testid="location">{location.pathname + location.search}</output>; }
function show(path = "/products") {
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><SessionProvider><Ready>
    <Location /><MobileBottomNav />
  </Ready></SessionProvider></MemoryRouter></QueryClientProvider>);
}
beforeEach(() => { context = httpContext({ ...member }); client = createQueryClient(); });
afterEach(() => { client.clear(); vi.unstubAllGlobals(); });

describe("mobile bottom navigation", () => {
  it("shows the requested five controls and opens a working navigation menu", async () => {
    show();
    const user = userEvent.setup();
    const nav = await screen.findByRole("navigation", { name: "Điều hướng chính" });
    expect(within(nav).getAllByRole("listitem").map((item) => item.textContent)).toEqual(["Khám phá", "Yêu thích", "Đăng bán", "Tài khoản", "Menu"]);
    const links = within(nav).getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual(["/", "/favorites", "/account/products/new", "/account"]);
    expect(links[0]).toHaveAttribute("aria-current", "page");
    const trigger = within(nav).getByRole("button", { name: "Menu" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    await user.click(trigger);
    const menu = await screen.findByRole("dialog", { name: "Menu" });
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(within(menu).getByRole("link", { name: "Tin nhắn" })).toHaveAttribute("href", "/messages");
    await user.click(within(menu).getByRole("link", { name: "Đơn mua" }));
    expect(screen.getByTestId("location")).toHaveTextContent("/orders");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes Menu with Escape and restores focus", async () => {
    show();
    const user = userEvent.setup();
    const trigger = await screen.findByRole("button", { name: "Menu" });
    await user.click(trigger);
    await screen.findByRole("dialog", { name: "Menu" });
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("lets guests open Menu and sign in with their current destination preserved", async () => {
    context.viewer = null;
    show("/products?q=ban");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Menu" }));
    const menu = screen.getByRole("dialog", { name: "Menu" });
    const login = within(menu).getByRole("link", { name: "Đăng nhập" });
    expect(new URL(login.getAttribute("href")!, "https://remarket.test").searchParams.get("returnTo")).toBe("/products?q=ban");
    expect(within(menu).getByRole("link", { name: "Khám phá sản phẩm" })).toHaveAttribute("href", "/products");
    expect(within(menu).queryByRole("link", { name: "Đơn mua" })).not.toBeInTheDocument();
    await user.click(login);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByTestId("location").textContent).toContain("/login?");
  });

  it("includes the admin destination only for an admin", async () => {
    context.viewer = { ...member, role: "ADMIN" };
    show();
    await userEvent.click(await screen.findByRole("button", { name: "Menu" }));
    expect(within(screen.getByRole("dialog", { name: "Menu" })).getByRole("link", { name: "Trang quản trị" })).toHaveAttribute("href", "/admin");
  });

  it.each(["/products/item", "/checkout", "/account/products/new", "/messages/chat", "/orders/order", "/sales/order"])("keeps the task action/composer clear on %s", async (path) => {
    show(path);
    await screen.findByTestId("location");
    expect(screen.queryByRole("navigation", { name: "Điều hướng chính" })).not.toBeInTheDocument();
  });
});
