import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiImage, apiImageCrossOrigin } from "./ApiImage";
import { API_BASE_URL } from "../../../config/environment";

afterEach(() => vi.restoreAllMocks());
describe("API image CORS", () => {
  it("opts direct cross-origin API images into the configured CORS allowlist", () => {
    expect(apiImageCrossOrigin("https://api.test/api/v1/uploads/a.png?signature=s", "https://api.test/api/v1")).toBe("anonymous");
    expect(apiImageCrossOrigin("https://api.test/prefix/api/v1/uploads/a.png", "https://api.test/prefix/api/v1/")).toBe("anonymous");
  });
  it("supports same-origin proxy URLs", () => {
    expect(apiImageCrossOrigin("/api/v1/uploads/a.png", "/api/v1")).toBe("anonymous");
  });
  it("does not impose CORS on unrelated hosts, blob previews or other API paths", () => {
    expect(apiImageCrossOrigin("https://cdn.test/a.png", "https://api.test/api/v1")).toBeUndefined();
    expect(apiImageCrossOrigin("https://api.test/api/v1/products/a.png", "https://api.test/api/v1")).toBeUndefined();
    expect(apiImageCrossOrigin("https://api.test/api/v1/uploads-other/a.png", "https://api.test/api/v1")).toBeUndefined();
    expect(apiImageCrossOrigin("blob:http://localhost/test", "/api/v1")).toBeUndefined();
    expect(apiImageCrossOrigin(undefined)).toBeUndefined();
  });
  it("sets crossOrigin before loading API image src and preserves image props/events", () => {
    const onError = vi.fn();
    const src = `${new URL(API_BASE_URL, window.location.origin).toString().replace(/\/$/, "")}/uploads/a.png?signature=s`;
    render(<ApiImage src={src} alt="Avatar" className="rounded-full" loading="lazy" onError={onError} />);
    const image = screen.getByRole("img");
    expect(image).toHaveAttribute("crossorigin", "anonymous");
    expect(image).toHaveAttribute("src", src);
    expect(image).toHaveClass("rounded-full");
    expect(image).toHaveAttribute("loading", "lazy");
    fireEvent.error(image);
    expect(onError).toHaveBeenCalledOnce();
  });
  it("leaves third-party images in their original no-cors mode", () => {
    render(<ApiImage src="https://cdn.test/a.png" alt="External" />);
    expect(screen.getByRole("img")).not.toHaveAttribute("crossorigin");
  });
});
