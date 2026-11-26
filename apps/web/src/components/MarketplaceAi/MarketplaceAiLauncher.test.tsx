import { fireEvent, render, screen } from "@testing-library/react";
import { Link, MemoryRouter } from "react-router-dom";
import { expect, it, vi } from "vitest";
import { MarketplaceAiLauncher } from "./MarketplaceAiLauncher";

const { loadWidget } = vi.hoisted(() => ({ loadWidget: vi.fn() }));

vi.mock("./MarketplaceAi", () => {
  loadWidget();
  return {
    default: ({ open, onOpenChange }: { open: boolean; onOpenChange: (value: boolean) => void }) => (
      <section hidden={!open} aria-label="Cuộc trò chuyện">
        <input aria-label="Bản nháp" />
        <button type="button" onClick={() => onOpenChange(false)}>Đóng cuộc trò chuyện</button>
      </section>
    ),
  };
});

it("loads the widget on first open and retains its state across close and navigation", async () => {
  render(<MemoryRouter>
    <Link to="/products">Đến sản phẩm</Link>
    <MarketplaceAiLauncher userId="member" />
  </MemoryRouter>);
  const launcher = screen.getByRole("button", { name: "Trợ lý ReMarket" });
  expect(loadWidget).not.toHaveBeenCalled();
  expect(launcher).toHaveAttribute("aria-expanded", "false");

  fireEvent.click(launcher);
  const draft = await screen.findByRole("textbox", { name: "Bản nháp" });
  fireEvent.change(draft, { target: { value: "Tìm bàn" } });
  fireEvent.click(screen.getByRole("button", { name: "Đóng cuộc trò chuyện" }));
  expect(launcher).toHaveFocus();
  expect(launcher).toHaveAttribute("aria-expanded", "false");

  fireEvent.click(launcher);
  fireEvent.click(screen.getByRole("link", { name: "Đến sản phẩm" }));
  expect(launcher).toHaveAttribute("aria-expanded", "false");
  fireEvent.click(launcher);
  expect(screen.getByRole("textbox", { name: "Bản nháp" })).toHaveValue("Tìm bàn");
  expect(loadWidget).toHaveBeenCalledTimes(1);
});
