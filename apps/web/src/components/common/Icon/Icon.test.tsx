import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CategoryIcon, HeartIcon, Icon } from "./Icon";

describe("native SVG icons", () => {
  it("hides decorative icons and forwards size, color and SVG attributes", () => {
    const { container } = render(<Icon name="heart" size={32} className="text-brand" strokeWidth={2} />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).toHaveAttribute("focusable", "false");
    expect(svg).toHaveAttribute("width", "32");
    expect(svg).toHaveAttribute("height", "32");
    expect(svg).toHaveAttribute("stroke", "currentColor");
    expect(svg).toHaveAttribute("stroke-width", "2");
    expect(svg).toHaveClass("text-brand");
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("exposes named icons to assistive technology", () => {
    render(<HeartIcon aria-label="Yêu thích" />);
    expect(screen.getByRole("img", { name: "Yêu thích" })).not.toHaveAttribute("aria-hidden");
  });

  it("supports aria-labelledby", () => {
    render(<><span id="icon-label">Tìm kiếm</span><Icon name="search" aria-labelledby="icon-label" /></>);
    expect(screen.getByRole("img", { name: "Tìm kiếm" })).not.toHaveAttribute("aria-hidden");
  });

  it("falls back to a neutral category for unknown slugs, including inherited object keys", () => {
    const { container, rerender } = render(<CategoryIcon slug="unknown" />);
    const fallback = container.querySelector("path")?.getAttribute("d");
    rerender(<CategoryIcon slug="toString" />);
    expect(container.querySelector("path")).toHaveAttribute("d", fallback);
    rerender(<CategoryIcon slug="dien-tu" />);
    expect(container.querySelector("path")?.getAttribute("d")).not.toBe(fallback);
  });
});
