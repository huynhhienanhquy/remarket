import { PROVINCES } from "@remarket/shared";

const provinceCodes = new Set(PROVINCES.map((province) => province.code));

/** Validate against the same versioned dataset used by DTO labels and seed data. */
export function isKnownProvinceCode(code: string): boolean {
  return provinceCodes.has(code);
}
