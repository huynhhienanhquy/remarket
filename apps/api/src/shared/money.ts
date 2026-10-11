import { addVnd, compareVnd } from "@remarket/shared";
export const cmpMoney = compareVnd;
export function sumMoney(values: readonly string[]): string { return addVnd(...values); }
