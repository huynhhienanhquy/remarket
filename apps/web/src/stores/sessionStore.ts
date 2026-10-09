import type { SessionUser } from "@remarket/shared";

type SessionListener = (user: SessionUser | null) => void;
type ValidationState = { status: "checking" } | { status: "ready" } | { status: "error"; error: unknown };
const listeners = new Set<SessionListener>();
const validationListeners = new Set<(state: ValidationState) => void>();
let currentUser: SessionUser | null = null;
let revision = 0;

/** In-memory only. Changes in identity or capabilities invalidate private work. */
export function sameSessionContext(left: SessionUser | null, right: SessionUser | null): boolean {
  return left?.id === right?.id && left?.role === right?.role && left?.status === right?.status
    && left?.email_verified_at === right?.email_verified_at;
}

export function updateSessionUser(user: SessionUser | null): void {
  if (!sameSessionContext(currentUser, user)) revision += 1;
  currentUser = user;
  for (const listener of listeners) listener(user);
}

export function getSessionRevision(): number { return revision; }
export function getSessionUser(): SessionUser | null { return currentUser; }

export function subscribeSessionUser(listener: SessionListener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function updateSessionValidation(state: ValidationState): void {
  for (const listener of validationListeners) listener(state);
}

export function subscribeSessionValidation(listener: (state: ValidationState) => void): () => void {
  validationListeners.add(listener);
  return () => { validationListeners.delete(listener); };
}
