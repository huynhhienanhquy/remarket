import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProductFormPage } from "@/pages/ProductFormPage/ProductFormPage";
import { httpContext } from "@/tests/http-context";
import { member, product } from "@/tests/test-data";
import { createMemberPageHarness } from "@/tests/renderMemberPage";

let context: ReturnType<typeof httpContext>;
const harness = createMemberPageHarness();
const show = harness.show;
beforeEach(() => { context = httpContext({ ...member }); context.reply("GET", "/products/" + product.id, product); });
afterEach(() => { harness.cleanup(); vi.unstubAllGlobals(); });

describe("member workflows through the HTTP adapter", () => {
  it("loads canonical Hồ Chí Minh codes from the API only once", async () => {
    show(<ProductFormPage />, "/account/products/new");
    await waitFor(() => expect(document.querySelector('option[value="VN-52"]')).toBeInTheDocument());
    expect(document.querySelector('option[value="VN-65"]')).not.toBeInTheDocument();
    expect(context.requests("GET", "/provinces")).toHaveLength(1);
  });

  it("validates product and shipping fields in one form and submits uploaded images", async () => {
    context.reply("GET", "/categories", [{ id: "category-test", name: "Điện tử", slug: "dien-tu", parent_id: null, status: "ACTIVE", children: [] }]);
    context.on("POST", "/uploads", ({ body }) => {
      const file = (body as FormData).get("file") as File;
      return { url: `/api/v1/uploads/${file.name}`, storage_path: `products/${file.name}` };
    });
    context.reply("POST", "/products", { ...product, status: "PENDING", allowed_actions: ["edit", "view"] });
    show(<ProductFormPage />, "/account/products/new");

    const user = userEvent.setup();
    expect(await screen.findByRole("region", { name: "Thông tin sản phẩm" })).toBeVisible();
    expect(screen.getByRole("region", { name: "Hình thức vận chuyển" })).toBeVisible();
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    const publish = screen.getByRole("button", { name: "Đăng bán" });
    await waitFor(() => expect(publish).toBeEnabled());
    const shippingFee = screen.getByRole("textbox", { name: "Phí giao hàng (₫)" });
    await user.clear(shippingFee);
    await user.click(publish);
    expect(screen.getByRole("textbox", { name: "Tên sản phẩm" })).toHaveAttribute("aria-invalid", "true");
    expect(shippingFee).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Phí giao hàng không được để trống.")).toBeVisible();
    expect(context.requests("POST", "/products")).toHaveLength(0);

    await user.type(screen.getByRole("textbox", { name: "Tên sản phẩm" }), "Bàn phím cơ đã dùng");
    await user.selectOptions(screen.getByRole("combobox", { name: "Danh mục" }), "category-test");
    await user.type(screen.getByRole("textbox", { name: "Giá bán" }), "450000");
    await user.selectOptions(screen.getByRole("combobox", { name: "Địa điểm" }), "VN-52");
    await user.type(screen.getByRole("textbox", { name: "Mô tả sản phẩm" }), "Bàn phím cơ vẫn hoạt động tốt, đầy đủ phím.");
    fireEvent.drop(screen.getByText("Kéo thả hoặc bấm để chọn ảnh"), { dataTransfer: { files: [
      new File(["first"], "front.jpg", { type: "image/jpeg" }),
      new File(["second"], "back.png", { type: "image/png" }),
    ] } });
    await screen.findByRole("button", { name: "Xóa ảnh 2" });

    await user.selectOptions(screen.getByRole("combobox", { name: "Hình thức giao nhận" }), "MEETUP");
    await user.click(publish);
    await waitFor(() => expect(context.requests("POST", "/products")[0]?.body).toMatchObject({
      title: "Bàn phím cơ đã dùng",
      price: "450000",
      delivery_method: "MEETUP",
      shipping_fee: "0",
      images: [
        { storage_path: "products/front.jpg", sort_order: 0 },
        { storage_path: "products/back.png", sort_order: 1 },
      ],
    }));
  });
});
