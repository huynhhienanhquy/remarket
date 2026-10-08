import type { Decimal } from "@prisma/client/runtime/library";
import { validationError } from "./errors.js";

/**
 * Money helpers. Amounts are decimal strings of non-negative VND integers
 * (detail-project 13.1) — never a JS number, which rounds above 2^53.
 */

/** 1_000_000_000 VND product cap and 10_000_000 shipping cap (detail-project 7.2). */
export const MAX_PRODUCT_PRICE = "1000000000";
export const MAX_SHIPPING_FEE = "10000000";

/** Prisma Decimal -> canonical integer string. */
export function money(value: Decimal | number | string): string {
  if (typeof value === "string") return normalizeMoney(value);
  if (typeof value === "number") return normalizeMoney(String(Math.trunc(value)));
  return value.toFixed(0);
}

/** Accepts "1.100.000", "1 100 000" or "1100000"; returns digits or null. */
export function normalizeMoney(raw: string): string {
  return raw.replace(/[.\s]/g, "");
}

/** Validates an amount coming from the client and returns its canonical form. */
export function parseMoney(raw: unknown, label: string): string {
  if (typeof raw !== "string" && typeof raw !== "number") {
    throw validationError(`${label} không hợp lệ.`, { [label]: "Bắt buộc." });
  }
  const digits = normalizeMoney(String(raw));
  if (!/^\d+$/.test(digits)) {
    throw validationError(`${label} phải là số nguyên VND.`, {
      [label]: "Nhập số nguyên VND, ví dụ 1100000.",
    });
  }
  if (digits.length > 15) {
    throw validationError(`${label} vượt quá giới hạn.`, { [label]: "Giá trị quá lớn." });
  }
  return digits;
}

export function assertMax(amount: string, max: string, label: string): void {
  if (BigInt(amount) > BigInt(max)) {
    throw validationError(`${label} vượt quá mức cho phép.`, {
      [label]: `Tối đa ${max} VND.`,
    });
  }
}

export function assertPositive(amount: string, label: string): void {
  if (BigInt(amount) <= 0n) {
    throw validationError(`${label} phải lớn hơn 0.`, { [label]: "Nhập giá trị lớn hơn 0." });
  }
}

/** Lexicographic-safe compare for equal-length digit strings. */
export function cmpMoney(a: string, b: string): number {
  const x = BigInt(a);
  const y = BigInt(b);
  return x < y ? -1 : x > y ? 1 : 0;
}

export function sumMoney(values: string[]): string {
  return values.reduce((acc, v) => (BigInt(acc) + BigInt(v)).toString(), "0");
}
