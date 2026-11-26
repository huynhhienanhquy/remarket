import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePointerInteractions } from "./usePointerInteractions";

function Surface({ showButton = true, busy = false, showDialog = false } = {}) {
  usePointerInteractions("test-surface");

  return (
    <div id="test-surface" data-testid="surface">
      <a className="rm-card-tile" href="/products"><span>Danh mục</span></a>
      <article className="rm-card-preview" data-testid="product">
        <a className="rm-card-link" href="/products/1">Sản phẩm</a>
        <button type="button">Lưu sản phẩm</button>
      </article>
      {showButton && <button type="button" className="rm-button-primary" disabled={busy}>Mua ngay</button>}
      <button type="button" className="rm-button-primary" aria-busy="true">Đang xử lý</button>
      <div className="rm-card-action" data-testid="row"><button type="button">Thao tác hàng</button></div>
      {showDialog && <div role="dialog" aria-modal="true">Hộp thoại</div>}
    </div>
  );
}

function move(target: Element, x: number, y: number, pointerType = "mouse") {
  const event = new MouseEvent("pointermove", { bubbles: true, clientX: x, clientY: y });
  Object.defineProperty(event, "pointerType", { value: pointerType });
  fireEvent(target, event);
}

describe("user web pointer interactions", () => {
  const media = Object.assign(new EventTarget(), { matches: true });
  const frames = new Map<number, FrameRequestCallback>();
  let frameTime = 0;
  const flushFrame = () => act(() => {
    frameTime += 1000 / 60;
    for (const [id, callback] of [...frames]) {
      frames.delete(id);
      callback(frameTime);
    }
  });

  beforeEach(() => {
    let id = 0;
    frameTime = 0;
    media.matches = true;
    vi.stubGlobal("matchMedia", vi.fn(() => media));
    vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => {
      frames.set(++id, callback);
      return id;
    }));
    vi.stubGlobal("cancelAnimationFrame", vi.fn((frame: number) => frames.delete(frame)));
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockReturnValue(DOMRect.fromRect({ x: 20, y: 40, width: 100, height: 80 }));
  });

  it("settles with inertia, stops requesting frames at rest, and leaves the hit area clean", () => {
    render(<Surface />);
    const button = screen.getByRole("button", { name: "Mua ngay" });
    move(button, 40, 80);
    flushFrame();
    expect(frames.size).toBe(0);
    expect(button.style.getPropertyValue("--rm-pointer-x")).toBe("-0.600");

    move(button, 100, 80);
    flushFrame();
    const springPosition = Number(button.style.getPropertyValue("--rm-pointer-x"));
    expect(springPosition).toBeGreaterThan(-0.6);
    expect(springPosition).toBeLessThan(0.6);

    for (let index = 0; index < 45 && frames.size; index++) flushFrame();
    expect(button.style.getPropertyValue("--rm-pointer-x")).toBe("0.600");
    expect(HTMLElement.prototype.getBoundingClientRect).toHaveBeenCalledTimes(2);
    expect(frames.size).toBe(0);

    move(button, 125, 80);
    flushFrame();
    expect(button).not.toHaveAttribute("data-pointer-active");
    expect(button.style.getPropertyValue("--rm-pointer-x")).toBe("");
    expect(frames.size).toBe(0);

    move(screen.getByTestId("surface"), 60, 80);
    expect(frames.size).toBe(0);
  });

  afterEach(() => {
    frames.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("uses the latest coordinates once per frame and leaves catalogue cards to CSS", () => {
    render(<Surface />);
    const link = screen.getByRole("link", { name: "Danh mục" });
    move(link, 30, 50);
    move(link, 95, 60);
    expect(frames.size).toBe(1);

    flushFrame();
    expect(link).toHaveAttribute("data-pointer-active");
    expect(link.style.getPropertyValue("--rm-pointer-x")).toBe("0.500");
    expect(link.style.getPropertyValue("--rm-pointer-y")).toBe("-0.500");
    expect(link.style.getPropertyValue("--rm-light-x")).toBe("25.0px");
    expect(HTMLElement.prototype.getBoundingClientRect).toHaveBeenCalledTimes(1);

    move(screen.getByRole("link", { name: "Sản phẩm" }), 105, 55);
    expect(link).not.toHaveAttribute("data-pointer-active");
    expect(link.style.getPropertyValue("--rm-light-x")).toBe("");
    move(screen.getByRole("button", { name: "Lưu sản phẩm" }), 105, 55);
    expect(screen.getByTestId("product")).not.toHaveAttribute("data-pointer-active");
    expect(frames.size).toBe(0);
  });

  it("ignores touch and busy controls, and cancels work on a motion preference change or unmount", () => {
    const { unmount } = render(<Surface />);
    const button = screen.getByRole("button", { name: "Mua ngay" });
    move(button, 55, 65, "touch");
    expect(frames.size).toBe(0);

    const busy = screen.getByRole("button", { name: "Đang xử lý" });
    move(busy, 55, 65);
    flushFrame();
    expect(busy).not.toHaveAttribute("data-pointer-active");

    move(button, 55, 65);
    flushFrame();
    expect(button).toHaveAttribute("data-pointer-active");
    move(button, 65, 65);
    media.matches = false;
    media.dispatchEvent(new Event("change"));
    expect(frames.size).toBe(0);
    expect(button).not.toHaveAttribute("data-pointer-active");
    move(button, 65, 65);
    expect(frames.size).toBe(0);

    media.matches = true;
    media.dispatchEvent(new Event("change"));
    move(button, 65, 65);
    expect(frames.size).toBe(1);
    unmount();
    expect(frames.size).toBe(0);
    move(button, 75, 65);
    expect(frames.size).toBe(0);
  });

  it("samples the entry edge once and releases a row when the pointer enters its button", () => {
    render(<Surface />);
    const row = screen.getByTestId("row");
    move(row, 117, 80);
    flushFrame();
    expect(row).toHaveAttribute("data-pointer-side", "right");
    move(row, 25, 80);
    expect(frames.size).toBe(0);

    move(screen.getByRole("button", { name: "Thao tác hàng" }), 60, 80);
    expect(row).not.toHaveAttribute("data-pointer-active");
    expect(row).not.toHaveAttribute("data-pointer-side");
    expect(frames.size).toBe(0);
  });

  it("clears an idle tracked surface when it is disabled, removed or covered", async () => {
    const { rerender } = render(<Surface />);
    const button = screen.getByRole("button", { name: "Mua ngay" });
    const enter = () => {
      move(button, 60, 80);
      flushFrame();
      expect(button).toHaveAttribute("data-pointer-active");
      expect(frames.size).toBe(0);
    };

    enter();
    await act(async () => rerender(<Surface busy />));
    expect(button).not.toHaveAttribute("data-pointer-active");
    rerender(<Surface />);
    enter();
    await act(async () => rerender(<Surface showDialog />));
    expect(button).not.toHaveAttribute("data-pointer-active");
    rerender(<Surface />);
    enter();
    await act(async () => rerender(<Surface showButton={false} />));
    expect(button).not.toHaveAttribute("data-pointer-active");
  });
});
