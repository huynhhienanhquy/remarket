import { Prisma } from "@prisma/client";

export interface CategoryPolicyNode { id: string; parentId: string | null; status: string; isLeaf: boolean }

export function eligibleCategoryIds(rows: readonly CategoryPolicyNode[]): Set<string> {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const result = new Set<string>();
  for (const leaf of rows) {
    if (!leaf.isLeaf) continue;
    const visited = new Set<string>();
    let node: CategoryPolicyNode | undefined = leaf;
    while (node && node.status === "ACTIVE" && !visited.has(node.id)) {
      visited.add(node.id);
      if (node.parentId === null) { result.add(leaf.id); break; }
      node = byId.get(node.parentId);
    }
  }
  return result;
}

/** Load all required ancestors and leaf checks in one database round trip. */
export async function loadCategoryEligibility(tx: Prisma.TransactionClient, ids?: readonly string[], lock = false): Promise<Set<string>> {
  if (ids?.length === 0) return new Set();
  const rows = await tx.$queryRaw<CategoryPolicyNode[]>(Prisma.sql`
    WITH RECURSIVE chain AS (
      SELECT c."id", c."parentId", c."status" FROM "Category" c
      ${ids ? Prisma.sql`WHERE c."id" IN (${Prisma.join(ids)})` : Prisma.empty}
      UNION
      SELECT c."id", c."parentId", c."status" FROM "Category" c
      JOIN chain child ON c."id" = child."parentId"
    )
    SELECT c."id", c."parentId", c."status", NOT EXISTS (
      SELECT 1 FROM "Category" child WHERE child."parentId" = c."id"
    ) AS "isLeaf" FROM "Category" c WHERE c."id" IN (SELECT "id" FROM chain)
    ORDER BY c."id" ${lock ? Prisma.sql`FOR SHARE OF c` : Prisma.empty}
  `);
  return eligibleCategoryIds(rows);
}
