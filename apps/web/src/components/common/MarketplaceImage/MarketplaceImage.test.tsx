import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MarketplaceImage, imageVariantUrl } from "./MarketplaceImage";

describe("marketplace images", () => {
  it("adds a bounded derivative only to signed ReMarket URLs", () => {
    expect(imageVariantUrl("/api/v1/uploads/a.jpg?signature=s&resource=r", "card")).toContain("variant=card");
    expect(imageVariantUrl("https://cdn.test/a.jpg", "card")).toBe("https://cdn.test/a.jpg");
  });
  it("falls back from a missing derivative once, then renders a stable placeholder", () => {
    const src = "/api/v1/uploads/a.jpg?signature=s&resource=r";
    render(<MarketplaceImage src={src} variant="card" alt="Product" />);
    fireEvent.error(screen.getByRole("img"));
    expect(screen.getByRole("img")).toHaveAttribute("src", src);
    fireEvent.error(screen.getByRole("img"));
    expect(screen.getByRole("img", { name: "Product" })).not.toHaveAttribute("src");
  });
  it("does not attempt to load reserved example.com image URLs", () => {
    render(<MarketplaceImage src="https://example.com/old-seed.jpg" alt="Product" />);
    expect(screen.getByRole("img")).not.toHaveAttribute("src");
  });
  it("does not issue a request for an absent snapshot image", () => {
    render(<MarketplaceImage src="" alt="Product" />);
    expect(screen.getByRole("img")).not.toHaveAttribute("src");
  });
  it("resets a failed image when a new product URL is supplied", () => {
    const view = render(<MarketplaceImage src="/a.jpg" alt="Product" />);
    fireEvent.error(screen.getByRole("img"));
    view.rerender(<MarketplaceImage src="/b.jpg" alt="Product" />);
    expect(screen.getByRole("img")).toHaveAttribute("src", "/b.jpg");
  });
});
