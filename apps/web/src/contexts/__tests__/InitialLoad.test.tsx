import { QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createQueryClient } from "../../config/queryClient";
import { MarketplaceShell } from "../../layouts/MarketplaceShell/MarketplaceShell";
import { HomePage } from "../../pages/HomePage/HomePage";
import { SearchPage } from "../../pages/SearchPage/SearchPage";
import { httpContext, page } from "../../tests/http-context";
import { member, product } from "../../tests/test-data";
import { SessionProvider } from "../SessionContext";

const clients: ReturnType<typeof createQueryClient>[] = [];
afterEach(() => { clients.splice(0).forEach((client) => client.clear()); vi.unstubAllGlobals(); });

describe("first marketplace load", () => {
  it.each(["/", "/products"])("fetches %s once with the resolved identity instead of discarding guest requests", async (path) => {
    const context = httpContext(member);
    let finish!: () => void;
    context.on("POST", "/auth/bootstrap", () => new Promise((resolve) => {
      finish = () => resolve({ user: member, access_token: "test-access-token" });
    }));
    context.reply("GET", "/products", page([product]));
    const client = createQueryClient();
    clients.push(client);
    render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><SessionProvider><Routes>
      <Route element={<MarketplaceShell />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/products" element={<SearchPage />} />
      </Route>
    </Routes></SessionProvider></MemoryRouter></QueryClientProvider>);
    await waitFor(() => expect(finish).toBeTypeOf("function"));
    expect(context.requests("GET", "/products")).toHaveLength(0);
    expect(context.requests("GET", "/categories")).toHaveLength(0);
    await act(async () => { finish(); });
    await screen.findByText(product.title);
    expect(context.requests("GET", "/products")).toHaveLength(1);
    expect(context.requests("GET", "/products")[0]!.headers.get("Authorization")).toBe("Bearer test-access-token");
    expect(context.requests("GET", "/categories")).toHaveLength(1);
  });
});
