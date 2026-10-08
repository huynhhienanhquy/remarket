import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ImageUpload } from "./ImageUpload";

describe("ImageUpload", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not cancel the native file-input click that opens the picker", () => {
    render(<ImageUpload onUpload={vi.fn()} />);
    const input = screen.getByLabelText("Thêm ảnh");
    const click = new MouseEvent("click", { bubbles: true, cancelable: true });

    expect(input.dispatchEvent(click)).toBe(true);
    expect(click.defaultPrevented).toBe(false);
  });

  it("uploads through the active HTTP adapter and returns its storage metadata", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: {
            url: "/api/v1/uploads/photo.jpg",
            storage_path: "users/user-1/product/photo.jpg",
          },
          meta: { request_id: "request-1" },
        }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      ),
    );
    const onUpload = vi.fn();
    render(<ImageUpload onUpload={onUpload} />);

    const file = new File(["image bytes"], "photo.jpg", { type: "image/jpeg" });
    fireEvent.change(screen.getByLabelText("Thêm ảnh"), { target: { files: [file] } });

    await waitFor(() => expect(onUpload).toHaveBeenCalledOnce());
    expect(onUpload).toHaveBeenCalledWith({
      url: "http://localhost:3000/api/v1/uploads/photo.jpg",
      storage_path: "users/user-1/product/photo.jpg",
    });
    expect(fetch).toHaveBeenCalledOnce();
    const [url, options] = fetch.mock.calls[0] ?? [];
    expect(url).toBe("http://localhost:3000/api/v1/uploads");
    expect(options).toMatchObject({ method: "POST", credentials: "include" });
    expect(options?.body).toBeInstanceOf(FormData);
    expect((options?.body as FormData).get("file")).toBe(file);
    expect((options?.body as FormData).get("purpose")).toBe("product");
  });

  it("rejects unsupported image formats before calling the adapter", () => {
    const alert = vi.spyOn(window, "alert").mockImplementation(() => undefined);
    const fetch = vi.spyOn(globalThis, "fetch");
    const onUpload = vi.fn();
    render(<ImageUpload onUpload={onUpload} />);

    const file = new File(["image bytes"], "photo.gif", { type: "image/gif" });
    fireEvent.change(screen.getByLabelText("Thêm ảnh"), { target: { files: [file] } });

    expect(onUpload).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledWith(
      "Định dạng ảnh không được hỗ trợ. Chỉ chấp nhận JPG, PNG, WebP.",
    );
  });
});
