import { QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { SessionProvider, useSession } from "@/contexts/SessionContext";
import { ToastProvider } from "@/components/common";
import { createQueryClient } from "@/config/queryClient";
import { SupportTicketPage } from "@/pages/SupportTicketPage/SupportTicketPage";

function CheckoutTarget() { const location = useLocation(); return <h1>{`Checkout ${location.search}`}</h1>; }
function VerificationTarget() { const location = useLocation(); return <h1>{`Email verification ${location.search}`}</h1>; }

function ReadySession({ children }: { children: ReactNode }) {
  return useSession().status === "ready" ? children : null;
}

export function createMemberPageHarness() {
const clients: ReturnType<typeof createQueryClient>[] = [];
function show(element: ReactNode, path = "/account", route = path.split("?")[0]!) {
  const client = createQueryClient();
  clients.push(client);
  client.setDefaultOptions({ queries: { retry: false, staleTime: 30_000 }, mutations: { retry: false } });
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><SessionProvider><ReadySession><ToastProvider><Routes>
    <Route path={route} element={element} />
    <Route path="/support/:id" element={<SupportTicketPage />} />
    <Route path="/sales/:id" element={<h1>Đơn bán đã mở</h1>} />
    <Route path="/orders/:id" element={<h1>Đơn mua đã tạo</h1>} />
    <Route path="/checkout" element={<CheckoutTarget />} />
    <Route path="/verify-email" element={<VerificationTarget />} />
    <Route path="/login" element={<h1>Đăng nhập để tiếp tục</h1>} />
  </Routes></ToastProvider></ReadySession></SessionProvider></MemoryRouter></QueryClientProvider>);
}
return { show, cleanup() { for (const client of clients.splice(0)) client.clear(); } };
}
