import { describe, expect, it } from "vitest";
import { accountStatsQuery, accountStatsRange, runAccountStats } from "../../src/services/ai/account-stats.js";
import { marketplaceContext } from "../../src/services/ai/marketplace-tools.js";

const scope = { topics: ["sales"] as const, start_date: null, end_date: null };
const now = new Date("2026-11-01T00:30:00+07:00");

describe("AI account statistics", () => {
  it("uses Vietnam calendar boundaries even when UTC is still in the previous month", () => {
    const query = accountStatsQuery.parse({ ...scope, period: "last_month" });
    expect(accountStatsRange(query, now)).toEqual({
      label: "01/10/2026 – 31/10/2026",
      range: { gte: new Date("2026-09-30T17:00:00Z"), lt: new Date("2026-10-31T17:00:00Z") },
    });
    const today = accountStatsQuery.parse({ ...scope, period: "today" });
    expect(accountStatsRange(today, now)).toEqual({
      label: "01/11/2026",
      range: { gte: new Date("2026-10-31T17:00:00Z"), lt: now },
    });
  });

  it("rejects a foreign account parameter and invalid calendar dates", async () => {
    expect(accountStatsQuery.safeParse({ ...scope, period: "all_time", user_id: "another-account" }).success).toBe(false);
    const query = accountStatsQuery.parse({ ...scope, period: "custom", start_date: "2026-02-30", end_date: "2026-10-31" });
    expect(accountStatsRange(query, now)).toBeNull();
    await expect(runAccountStats(query)).rejects.toThrow("Missing marketplace session context");

    await expect(marketplaceContext.run({
      viewer: { viewerId: "account-id", viewerStatus: "LOCKED", viewerRole: "USER", viewerEmailVerified: true },
      filters: {}, results: [], signal: new AbortController().signal,
    }, () => runAccountStats(query))).rejects.toThrow("Missing active marketplace account");
  });
});
