import { createBrowserRouter, Navigate, Outlet, RouterProvider } from "react-router-dom";
import { lazy, Suspense } from "react";
import type { ReactNode } from "react";
import { ToastProvider } from "../components/ui";
import { PageSkeleton } from "./PageSkeleton";
import { GuestOnly, RequireAdmin, RequireAuth, RequireVerified } from "./guards";
import { RouteError, ForbiddenBody, NotFoundBody } from "./RouteError";
import { SessionExpiryWatcher } from "./SessionExpiryWatcher";
import { ShellProvider } from "./shells/ShellContext";
import { AccountShell } from "./shells/AccountShell";
import { AdminShell } from "./shells/AdminShell";
import { AuthShell } from "./shells/AuthShell";
import { ChatShell, CheckoutShell } from "./shells/ChatShell";
import { MarketplaceShell } from "./shells/MarketplaceShell";

// Load the current screen only; the login entry need not download every admin,
// checkout and chat screen. Guards still run before private screens render.
const HomePage = lazy(() => import("../pages/discovery/HomePage").then((m) => ({ default: m.HomePage })));
const SearchPage = lazy(() => import("../pages/discovery/SearchPage").then((m) => ({ default: m.SearchPage })));
const ProductDetailPage = lazy(() => import("../pages/discovery/ProductDetailPage").then((m) => ({ default: m.ProductDetailPage })));
const SellerProfilePage = lazy(() => import("../pages/discovery/SellerProfilePage").then((m) => ({ default: m.SellerProfilePage })));
const LoginPage = lazy(() => import("../pages/auth/LoginPage").then((m) => ({ default: m.LoginPage })));
const RegisterPage = lazy(() => import("../pages/auth/RegisterPage").then((m) => ({ default: m.RegisterPage })));
const VerifyEmailPage = lazy(() => import("../pages/auth/VerifyEmailPage").then((m) => ({ default: m.VerifyEmailPage })));
const ForgotPasswordPage = lazy(() => import("../pages/auth/ForgotPasswordPage").then((m) => ({ default: m.ForgotPasswordPage })));
const ResetPasswordPage = lazy(() => import("../pages/auth/ResetPasswordPage").then((m) => ({ default: m.ResetPasswordPage })));
const AccountPage = lazy(() => import("../pages/account/AccountPage").then((m) => ({ default: m.AccountPage })));
const MyProductsPage = lazy(() => import("../pages/account/MyProductsPage").then((m) => ({ default: m.MyProductsPage })));
const ProductFormPage = lazy(() => import("../pages/account/ProductFormPage").then((m) => ({ default: m.ProductFormPage })));
const FavoritesPage = lazy(() => import("../pages/account/FavoritesPage").then((m) => ({ default: m.FavoritesPage })));
const NotificationsPage = lazy(() => import("../pages/account/NotificationsPage").then((m) => ({ default: m.NotificationsPage })));
const OrdersPage = lazy(() => import("../pages/orders/OrdersPage").then((m) => ({ default: m.OrdersPage })));
const OrderDetailPage = lazy(() => import("../pages/orders/OrderDetailPage").then((m) => ({ default: m.OrderDetailPage })));
const CartPage = lazy(() => import("../pages/cart/CartPage").then((m) => ({ default: m.CartPage })));
const CheckoutPage = lazy(() => import("../pages/checkout/CheckoutPage").then((m) => ({ default: m.CheckoutPage })));
const MessagesPage = lazy(() => import("../pages/chat/MessagesPage").then((m) => ({ default: m.MessagesPage })));
const ConversationPage = lazy(() => import("../pages/chat/ConversationPage").then((m) => ({ default: m.ConversationPage })));
const SupportListPage = lazy(() => import("../pages/support/SupportListPage").then((m) => ({ default: m.SupportListPage })));
const SupportNewPage = lazy(() => import("../pages/support/SupportNewPage").then((m) => ({ default: m.SupportNewPage })));
const SupportTicketPage = lazy(() => import("../pages/support/SupportTicketPage").then((m) => ({ default: m.SupportTicketPage })));
const AdminDashboardPage = lazy(() => import("../pages/admin/AdminDashboardPage").then((m) => ({ default: m.AdminDashboardPage })));
const AdminUsersPage = lazy(() => import("../pages/admin/AdminUsersPage").then((m) => ({ default: m.AdminUsersPage })));
const AdminProductsPage = lazy(() => import("../pages/admin/AdminProductsPage").then((m) => ({ default: m.AdminProductsPage })));
const AdminCategoriesPage = lazy(() => import("../pages/admin/AdminCategoriesPage").then((m) => ({ default: m.AdminCategoriesPage })));
const AdminReportsPage = lazy(() => import("../pages/admin/AdminReportsPage").then((m) => ({ default: m.AdminReportsPage })));
const AdminReviewsPage = lazy(() => import("../pages/admin/AdminReviewsPage").then((m) => ({ default: m.AdminReviewsPage })));
const AdminSupportPage = lazy(() => import("../pages/admin/AdminSupportPage").then((m) => ({ default: m.AdminSupportPage })));
const AdminAuditPage = lazy(() => import("../pages/admin/AdminAuditPage").then((m) => ({ default: m.AdminAuditPage })));

/**
 * Router root: providers that must render <Link> (toast actions) live inside
 * the router, and every session reaction happens once, above all routes.
 */
function RootLayout() {
  return (
    <ToastProvider>
      <ShellProvider>
        <SessionExpiryWatcher />
        <Suspense fallback={<PageSkeleton label="Đang tải trang…" />}>
          <Outlet />
        </Suspense>
      </ShellProvider>
    </ToastProvider>
  );
}

/** Private route wrapper: renders children only after the guard passes. */
function privateRoute(element: ReactNode) {
  return <RequireAuth>{element}</RequireAuth>;
}

const router = createBrowserRouter([
  {
    element: <RootLayout />,
    errorElement: <RouteError />,
    children: [
      {
        element: <MarketplaceShell />,
        children: [
          { index: true, element: <HomePage /> },
          { path: "products", element: <SearchPage /> },
          { path: "products/:id", element: <ProductDetailPage /> },
          { path: "users/:id", element: <SellerProfilePage /> },
          { path: "cart", element: privateRoute(<CartPage />) },
          { path: "403", element: <ForbiddenBody /> },
          { path: "404", element: <NotFoundBody /> },
          { path: "*", element: <NotFoundBody /> },
        ],
      },
      {
        path: "checkout",
        element: <CheckoutShell />,
        children: [{ index: true, element: privateRoute(<CheckoutPage />) }],
      },
      {
        path: "messages",
        element: <ChatShell />,
        children: [
          { index: true, element: privateRoute(<MessagesPage />) },
          { path: ":id", element: privateRoute(<ConversationPage />) },
        ],
      },
      {
        element: <AuthShell />,
        children: [
          {
            path: "login",
            element: (
              <GuestOnly>
                <LoginPage />
              </GuestOnly>
            ),
          },
          {
            path: "register",
            element: (
              <GuestOnly>
                <RegisterPage />
              </GuestOnly>
            ),
          },
          { path: "verify-email", element: <VerifyEmailPage /> },
          {
            path: "forgot-password",
            element: (
              <GuestOnly>
                <ForgotPasswordPage />
              </GuestOnly>
            ),
          },
          { path: "reset-password", element: <ResetPasswordPage /> },
        ],
      },
      {
        element: (
          <RequireAuth>
            <AccountShell />
          </RequireAuth>
        ),
        children: [
          { path: "account", element: <AccountPage /> },
          {
            path: "account/products",
            element: <RequireVerified><MyProductsPage /></RequireVerified>,
          },
          {
            path: "account/products/new",
            element: <RequireVerified><ProductFormPage /></RequireVerified>,
          },
          {
            path: "account/products/:id/edit",
            element: <RequireVerified><ProductFormPage /></RequireVerified>,
          },
          { path: "favorites", element: <FavoritesPage /> },
          { path: "notifications", element: <NotificationsPage /> },
          { path: "orders", element: <OrdersPage role="buyer" /> },
          { path: "orders/:id", element: <OrderDetailPage role="buyer" /> },
          { path: "sales", element: <OrdersPage role="seller" /> },
          { path: "sales/:id", element: <OrderDetailPage role="seller" /> },
          { path: "support", element: <SupportListPage /> },
          { path: "support/new", element: <SupportNewPage /> },
          { path: "support/:id", element: <SupportTicketPage /> },
        ],
      },
      {
        path: "admin",
        element: (
          <RequireAdmin>
            <AdminShell />
          </RequireAdmin>
        ),
        children: [
          { index: true, element: <AdminDashboardPage /> },
          { path: "users", element: <AdminUsersPage /> },
          { path: "products", element: <AdminProductsPage /> },
          { path: "categories", element: <AdminCategoriesPage /> },
          { path: "reports", element: <AdminReportsPage /> },
          { path: "reviews", element: <AdminReviewsPage /> },
          { path: "support", element: <AdminSupportPage /> },
          { path: "audit", element: <AdminAuditPage /> },
          { path: "*", element: <NotFoundBody /> },
        ],
      },
      { path: "*", element: <Navigate to="/404" replace /> },
    ],
  },
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
