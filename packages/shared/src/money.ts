/**
 * Money helpers. Amounts are decimal strings of non-negative VND integers
 * (detail-project 13.1), so grouping is done on the string and never through
 * Number, which would lose precision above 2^53.
 */

const VI_GROUPED = new Intl.NumberFormat("vi-VN");

/** "1100000" -> "1.100.000 ₫". Invalid input renders as-is instead of NaN. */
export function formatVnd(value: string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const normalized = normalizeVndInput(value);
  if (normalized === null) return value;
  if (normalized.length > 15) {
    // Beyond the 1.000.000.000 VND product cap the exact figure still matters
    // for totals; group manually to avoid Number rounding.
    return `${groupDigits(normalized)} ₫`;
  }
  return `${VI_GROUPED.format(Number(normalized))} ₫`;
}

/** Accepts "1.100.000", "1100000" or "1 100 000"; returns digits or null. */
export function normalizeVndInput(raw: string): string | null {
  const digits = raw.replace(/[.\s]/g, "");
  if (digits === "") return null;
  if (!/^\d+$/.test(digits)) return null;
  return digits.replace(/^0+(?=\d)/, "");
}

/** Human hint while typing; keeps the raw string untouched for the form state. */
export function formatVndWhileTyping(raw: string): string {
  const normalized = normalizeVndInput(raw);
  if (normalized === null) return raw;
  return groupDigits(normalized);
}

function groupDigits(digits: string): string {
  let out = "";
  for (let i = 0; i < digits.length; i += 1) {
    const fromEnd = digits.length - i;
    out += digits[i];
    if (fromEnd > 1 && (fromEnd - 1) % 3 === 0) out += ".";
  }
  return out;
}

const MAX_PRICE = 1_000_000_000;
const MAX_SHIPPING_FEE = 10_000_000;

export const MONEY_LIMITS = {
  maxPrice: MAX_PRICE,
  maxShippingFee: MAX_SHIPPING_FEE,
} as const;

/** Returns an error message or null when the raw VND input is valid. */
export function validatePrice(raw: string): string | null {
  const value = normalizeVndInput(raw);
  if (value === null) return "Giá phải là số nguyên dương (VND).";
  if (value === "0") return "Giá phải lớn hơn 0 ₫.";
  if (value.length > String(MAX_PRICE).length || BigInt(value) > BigInt(MAX_PRICE)) {
    return "Giá tối đa 1.000.000.000 ₫.";
  }
  return null;
}

export function validateShippingFee(raw: string, required: boolean): string | null {
  if (raw.trim() === "") {
    return required ? "Phí giao hàng không được để trống." : null;
  }
  const value = normalizeVndInput(raw);
  if (value === null) return "Phí giao hàng phải là số nguyên không âm (VND).";
  if (BigInt(value) > BigInt(MAX_SHIPPING_FEE)) {
    return "Phí giao hàng tối đa 10.000.000 ₫.";
  }
  return null;
}

/**
 * Shipping fee of an order: 0 for MEETUP, otherwise the highest fee among the
 * order's products (detail-project section 8).
 */
export function orderShippingFee(
  method: "COD" | "MEETUP",
  itemFees: readonly string[],
): string {
  if (method === "MEETUP") return "0";
  if (itemFees.length === 0) return "0";
  return itemFees.reduce((max, fee) => (BigInt(fee) > BigInt(max) ? fee : max), "0");
}

/** subtotal + shipping_fee with string math; throws on non-integer input. */
export function addVnd(...amounts: readonly string[]): string {
  return amounts
    .map((amount) => {
      if (!/^\d+$/.test(amount)) throw new Error(`Invalid VND amount: ${amount}`);
      return BigInt(amount);
    })
    .reduce((sum, amount) => sum + amount, 0n)
    .toString();
}

