import type { Prisma, PrismaClient } from "@prisma/client";
import { PROVINCES } from "@remarket/shared";
import { randomUUID } from "node:crypto";

const categories = [
    { id: "cat-1", parentId: null, name: "Điện tử", slug: "dien-tu", status: "ACTIVE" },
    { id: "cat-2", parentId: null, name: "Thời trang", slug: "thoi-trang", status: "ACTIVE" },
    { id: "cat-3", parentId: null, name: "Nội thất", slug: "noi-that", status: "ACTIVE" },
    { id: "cat-4", parentId: null, name: "Sách & văn phòng phẩm", slug: "sach-van-phong", status: "ACTIVE" },
    { id: "cat-5", parentId: null, name: "Xe cộ", slug: "xe-co", status: "ACTIVE" },
    { id: "cat-6", parentId: null, name: "Gia dụng", slug: "gia-dung", status: "ACTIVE" },
    { id: "cat-11", parentId: "cat-1", name: "Laptop", slug: "laptop", status: "ACTIVE" },
    { id: "cat-12", parentId: "cat-1", name: "Điện thoại", slug: "dien-thoai", status: "ACTIVE" },
    { id: "cat-13", parentId: "cat-1", name: "Âm thanh", slug: "am-thanh", status: "ACTIVE" },
    { id: "cat-14", parentId: "cat-1", name: "Phụ kiện máy tính", slug: "phu-kien-may-tinh", status: "ACTIVE" },
    { id: "cat-21", parentId: "cat-2", name: "Áo", slug: "ao", status: "ACTIVE" },
    { id: "cat-22", parentId: "cat-2", name: "Giày dép", slug: "giay-dep", status: "ACTIVE" },
    { id: "cat-31", parentId: "cat-3", name: "Bàn ghế", slug: "ban-ghe", status: "ACTIVE" },
    { id: "cat-32", parentId: "cat-3", name: "Tủ kệ", slug: "tu-ke", status: "ACTIVE" },
    { id: "cat-33", parentId: "cat-3", name: "Đèn", slug: "den", status: "ACTIVE" },
    { id: "cat-41", parentId: "cat-4", name: "Sách", slug: "sach", status: "ACTIVE" },
    { id: "cat-42", parentId: "cat-4", name: "Đồ dùng văn phòng", slug: "do-dung-van-phong", status: "ACTIVE" },
    { id: "cat-51", parentId: "cat-5", name: "Xe đạp", slug: "xe-dap", status: "ACTIVE" },
    { id: "cat-52", parentId: "cat-5", name: "Xe máy", slug: "xe-may", status: "ACTIVE" },
    { id: "cat-61", parentId: "cat-6", name: "Đồ gia dụng khác", slug: "do-gia-dung-khac", status: "ACTIVE" },
  ] satisfies Prisma.CategoryUncheckedCreateInput[];

/** Add missing reference rows without replacing operator-managed data. */
export async function seedReferenceData(prisma: PrismaClient): Promise<void> {
  const categoryIds = new Map<string, string>();
  for (const category of categories) {
    const parentId = category.parentId ? categoryIds.get(category.parentId) : null;
    if (category.parentId && !parentId) throw new Error("Missing reference category parent");
    const row = await prisma.category.upsert({
      where: { slug: category.slug },
      update: {},
      create: { ...category, parentId },
      select: { id: true },
    });
    categoryIds.set(category.id, row.id);
  }
  for (const province of PROVINCES) {
    await prisma.province.upsert({
      where: { code: province.code },
      update: {},
      create: { id: randomUUID(), ...province },
    });
  }
}
