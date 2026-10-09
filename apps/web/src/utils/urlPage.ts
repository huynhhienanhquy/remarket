export function urlPage(raw: string | null) {
  const page = Number(raw);
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}
