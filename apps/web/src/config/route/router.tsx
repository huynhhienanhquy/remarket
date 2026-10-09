import { RootLayout } from "../../layouts/RootLayout/RootLayout";
import { createBrowserRouter, Navigate, RouterProvider } from "react-router-dom";
import { lazy } from "react";
import type { ReactNode } from "react";
import { GuestOnly, RequireAdmin, RequireAuth, RequireVerified } from "./guards";
import { RouteError, ForbiddenBody, NotFoundBody } from "../../components/common/RouteError/RouteError";
import { AccountShell } from "../../layouts/AccountShell/AccountShell";
import { AdminShell } from "../../layouts/AdminShell/AdminShell";
import { AuthShell } from "../../layouts/AuthShell/AuthShell";
import { ChatShell, CheckoutShell } from "../../layouts/ChatShell/ChatShell";
import { MarketplaceShell } from "../../layouts/MarketplaceShell/MarketplaceShell";

// Load the current screen only; the login entry need not download every admin,
// checkout and chat screen. Guards still run before private screens render.
const HomePage = lazy(() => import("../../pages/HomePage/HomePage").then((m) => ({ default: m.HomePage })));
const SearchPage = lazy(() => import("../../pages/SearchPage/SearchPage").then((m) => ({ default: m.SearchPage })));
const ProductDetailPage = lazy(() => import("../../pages/ProductDetailPage/ProductDetailPage").then((m) => ({ default: m.ProductDetailPage })));
const SellerProfilePage = lazy(() => import("../../pages/SellerProfilePage/SellerProfilePage").then((m) => ({ default: m.SellerProfilePage })));
const LoginPage = lazy(() => import("../../pages/LoginPage/LoginPage").then((m) => ({ default: m.LoginPage })));
const RegisterPage = lazy(() => import("../../pages/RegisterPage/RegisterPage").then((m) => ({ default: m.RegisterPage })));
const VerifyEmailPage = lazy(() => import("../../pages/VerifyEmailPage/VerifyEmailPage").then((m) => ({ default: m.VerifyEmailPage })));
const ForgotPasswordPage = lazy(() => import("../../pages/ForgotPasswordPage/ForgotPasswordPage").then((m) => ({ default: m.ForgotPasswordPage })));
const ResetPasswordPage = lazy(() => import("../../pages/ResetPasswordPage/ResetPasswordPage").then((m) => ({ default: m.ResetPasswordPage })));
const AccountPage = lazy(() => import("../../pages/AccountPage/AccountPage").then((m) => ({ default: m.AccountPage })));
const MyProductsPage = lazy(() => import("../../pages/MyProductsPage/MyProductsPage").then((m) => ({ default: m.MyProductsPage })));
const ProductFormPage = lazy(() => import("../../pages/ProductFormPage/ProductFormPage").then((m) => ({ default: m.ProductFormPage })));
const FavoritesPage = lazy(() => import("../../pages/FavoritesPage/FavoritesPage").then((m) => ({ default: m.FavoritesPage })));
const NotificationsPage = lazy(() => import("../../pages/NotificationsPage/NotificationsPage").then((m) => ({ default: m.NotificationsPage })));
const OrdersPage = lazy(() => import("../../pages/OrdersPage/OrdersPage").then((m) => ({ default: m.OrdersPage })));
const OrderDetailPage = lazy(() => import("../../pages/OrderDetailPage/OrderDetailPage").then((m) => ({ default: m.OrderDetailPage })));
const CartPage = lazy(() => import("../../pages/CartPage/CartPage").then((m) => ({ default: m.CartPage })));
const CheckoutPage = lazy(() => import("../../pages/CheckoutPage/CheckoutPage").then((m) => ({ default: m.CheckoutPage })));
const MessagesPage = lazy(() => import("../../pages/MessagesPage/MessagesPage").then((m) => ({ default: m.MessagesPage })));
const ConversationPage = lazy(() => import("../../pages/ConversationPage/ConversationPage").then((m) => ({ default: m.ConversationPage })));
const SupportListPage = lazy(() => import("../../pages/SupportListPage/SupportListPage").then((m) => ({ default: m.SupportListPage })));
const SupportNewPage = lazy(() => import("../../pages/SupportNewPage/SupportNewPage").then((m) => ({ default: m.SupportNewPage })));
const SupportTicketPage = lazy(() => import("../../pages/SupportTicketPage/SupportTicketPage").then((m) => ({ default: m.SupportTicketPage })));
const AdminDashboardPage = lazy(() => import("../../pages/AdminDashboardPage/AdminDashboardPage").then((m) => ({ default: m.AdminDashboardPage })));
const AdminUsersPage = lazy(() => import("../../pages/AdminUsersPage/AdminUsersPage").then((m) => ({ default: m.AdminUsersPage })));
const AdminEmailVerificationsPage = lazy(() => import("../../pages/AdminEmailVerificationsPage/AdminEmailVerificationsPage").then((m) => ({ default: m.AdminEmailVerificationsPage })));
const AdminProductsPage = lazy(() => import("../../pages/AdminProductsPage/AdminProductsPage").then((m) => ({ default: m.AdminProductsPage })));
const AdminCategoriesPage = lazy(() => import("../../pages/AdminCategoriesPage/AdminCategoriesPage").then((m) => ({ default: m.AdminCategoriesPage })));
const AdminReportsPage = lazy(() => import("../../pages/AdminReportsPage/AdminReportsPage").then((m) => ({ default: m.AdminReportsPage })));
const AdminReviewsPage = lazy(() => import("../../pages/AdminReviewsPage/AdminReviewsPage").then((m) => ({ default: m.AdminReviewsPage })));
const AdminSupportPage = lazy(() => import("../../pages/AdminSupportPage/AdminSupportPage").then((m) => ({ default: m.AdminSupportPage })));
const AdminAuditPage = lazy(() => import("../../pages/AdminAuditPage/AdminAuditPage").then((m) => ({ default: m.AdminAuditPage })));

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
        element: <ChatShell />,
        children: [
          { path: "messages/:id", element: privateRoute(<ConversationPage />) },
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
          { path: "cart", element: <CartPage /> },
          { path: "messages", element: <MessagesPage /> },
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
          { path: "email-verifications", element: <AdminEmailVerificationsPage /> },
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
