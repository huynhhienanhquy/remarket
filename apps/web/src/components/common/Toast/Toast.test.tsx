import { StrictMode, useRef } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Toast, ToastProvider, useToast } from "./Toast";

function Controls() {
  const toast = useToast();
  const lastId = useRef("");
  const location = useLocation();
  return <>
    <button onClick={() => { lastId.current = toast.success("Đã lưu"); }}>Success</button>
    <button onClick={() => toast.error("Không thể lưu")}>Error</button>
    <button onClick={() => toast.warning("Cần kiểm tra", { duration: 1000 })}>Warning</button>
    <button onClick={() => toast.info("Đã thêm", { action: { label: "Xem giỏ hàng", to: "/cart" } })}>Action</button>
    <button onClick={() => toast.info("Giữ lại", { duration: 0 })}>Persistent</button>
    <button onClick={() => toast.dismiss(lastId.current)}>Dismiss</button>
    <button onClick={toast.dismissAll}>Dismiss all</button>
    <span data-testid="location">{location.pathname}</span>
  </>;
}

function setup() {
  return render(<StrictMode><MemoryRouter><ToastProvider><Controls /></ToastProvider></MemoryRouter></StrictMode>);
}

function advance(ms: number) {
  act(() => vi.advanceTimersByTime(ms));
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("native toast components", () => {
  it("dismisses success after four seconds but keeps errors until dismissed", () => {
    setup();
    fireEvent.click(screen.getByText("Success"));
    fireEvent.click(screen.getByText("Error"));
    expect(screen.getByRole("status")).toHaveTextContent("Đã lưu");
    expect(screen.getByRole("alert")).toHaveTextContent("Không thể lưu");
    advance(3999);
    expect(screen.getByText("Đã lưu")).toBeInTheDocument();
    advance(1);
    expect(screen.queryByText("Đã lưu")).not.toBeInTheDocument();
    advance(10000);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Đóng thông báo" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("honors custom durations and duration zero", () => {
    setup();
    fireEvent.click(screen.getByText("Warning"));
    fireEvent.click(screen.getByText("Persistent"));
    advance(1000);
    expect(screen.queryByText("Cần kiểm tra")).not.toBeInTheDocument();
    advance(10000);
    expect(screen.getByText("Giữ lại")).toBeInTheDocument();
  });

  it("keeps independent deadlines when another toast changes the provider", () => {
    setup();
    fireEvent.click(screen.getByText("Success"));
    advance(3000);
    fireEvent.click(screen.getByText("Action"));
    advance(1000);
    expect(screen.queryByText("Đã lưu")).not.toBeInTheDocument();
    expect(screen.getByText("Đã thêm")).toBeInTheDocument();
    advance(3000);
    expect(screen.queryByText("Đã thêm")).not.toBeInTheDocument();
  });

  it("pauses on hover and resumes only the remaining time", () => {
    setup();
    fireEvent.click(screen.getByText("Success"));
    advance(1500);
    fireEvent.mouseEnter(screen.getByRole("status"));
    advance(10000);
    expect(screen.getByText("Đã lưu")).toBeInTheDocument();
    fireEvent.mouseLeave(screen.getByRole("status"));
    advance(2499);
    expect(screen.getByText("Đã lưu")).toBeInTheDocument();
    advance(1);
    expect(screen.queryByText("Đã lưu")).not.toBeInTheDocument();
  });

  it("stays paused while keyboard focus moves between controls, even after hover ends", () => {
    setup();
    fireEvent.click(screen.getByText("Action"));
    advance(1000);
    const toast = screen.getByRole("status");
    const action = screen.getByRole("link", { name: "Xem giỏ hàng" });
    const close = screen.getByRole("button", { name: "Đóng thông báo" });
    fireEvent.mouseEnter(toast);
    fireEvent.focus(action);
    fireEvent.mouseLeave(toast);
    advance(5000);
    fireEvent.blur(action, { relatedTarget: close });
    fireEvent.focus(close);
    advance(5000);
    expect(toast).toBeInTheDocument();
    fireEvent.blur(close, { relatedTarget: screen.getByText("Success") });
    advance(3000);
    expect(screen.queryByText("Đã thêm")).not.toBeInTheDocument();
  });

  it("supports dismissal by returned ID and clearing all notifications", () => {
    setup();
    fireEvent.click(screen.getByText("Success"));
    fireEvent.click(screen.getByText("Error"));
    fireEvent.click(screen.getByText("Dismiss"));
    expect(screen.queryByText("Đã lưu")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Dismiss all"));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("navigates through the action and dismisses its toast", () => {
    setup();
    fireEvent.click(screen.getByText("Action"));
    fireEvent.click(screen.getByRole("link", { name: "Xem giỏ hàng" }));
    expect(screen.getByTestId("location")).toHaveTextContent("/cart");
    expect(screen.queryByText("Đã thêm")).not.toBeInTheDocument();
  });

  it("cleans up timers when the provider unmounts", () => {
    const view = setup();
    fireEvent.click(screen.getByText("Success"));
    fireEvent.click(screen.getByText("Warning"));
    expect(vi.getTimerCount()).toBe(2);
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("renders a standalone toast without a provider or router when there is no action", () => {
    const onDismiss = vi.fn();
    render(<Toast title="Đã hoàn tất" onDismiss={onDismiss} duration={500} />);
    advance(500);
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
