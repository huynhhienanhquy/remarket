import { PrismaClient } from "@prisma/client";
import { PROVINCES } from "@remarket/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { seedReferenceData } from "../../scripts/reference-data.js";

afterEach(() => vi.restoreAllMocks());

describe("reference-only seed", () => {
  it("preserves existing rows and uses resolved parent IDs without creating sample activity", async () => {
    const prisma = new PrismaClient();
    const category = vi.spyOn(prisma.category, "upsert").mockResolvedValue({
      id: "operator-category", name: "Operator name", slug: "operator-slug", parentId: null, status: "INACTIVE",
    });
    const province = vi.spyOn(prisma.province, "upsert").mockResolvedValue({ id: "operator-province", code: "VN-01", name: "Hà Nội" });
    const user = vi.spyOn(prisma.user, "createMany");
    const product = vi.spyOn(prisma.product, "create");
    const order = vi.spyOn(prisma.order, "create");
    try {
      await seedReferenceData(prisma);
      expect(category).toHaveBeenCalledTimes(20);
      expect(province).toHaveBeenCalledTimes(PROVINCES.length);
      for (const [args] of category.mock.calls) expect(args.update).toEqual({});
      for (const [args] of province.mock.calls) expect(args.update).toEqual({});
      expect(category.mock.calls.find(([args]) => args.where.slug === "laptop")?.[0].create.parentId).toBe("operator-category");
      expect(user).not.toHaveBeenCalled();
      expect(product).not.toHaveBeenCalled();
      expect(order).not.toHaveBeenCalled();
    } finally {
      await prisma.$disconnect();
    }
  });
});
