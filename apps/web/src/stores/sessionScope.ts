const STORAGE_KEY = "remarket:session-scope";
const SCOPE_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
let currentScope: string | null = null;

/** Only an opaque cookie selector is stored here, never credentials or PII. */
export function getSessionScope(): string {
  if (currentScope) return currentScope;
  try {
    const saved = window.sessionStorage.getItem(STORAGE_KEY);
    if (saved && SCOPE_PATTERN.test(saved)) currentScope = saved;
  } catch { /* Storage-disabled browsers keep an in-memory scope for this page. */ }
  if (!currentScope) setSessionScope(crypto.randomUUID());
  return currentScope!;
}

export function setSessionScope(scope: string): void {
  if (!SCOPE_PATTERN.test(scope)) throw new Error("Mã phiên tab không hợp lệ.");
  currentScope = scope;
  try { window.sessionStorage.setItem(STORAGE_KEY, scope); }
  catch { /* The current page still works when sessionStorage is unavailable. */ }
}
