import { buildDatabase } from "./fixtures";
import type { Database } from "./types";

/**
 * In-memory mock database. Rebuilt from fixtures on reset so every session
 * starts from the same documented state (ui-spec 27) and mutations never leak
 * between page reloads in a confusing way.
 */
let database: Database | null = null;

/** Session key: stores only the mock user id, never a credential or token. */
const SESSION_KEY = "remarket.mock.session";

export function db(): Database {
  if (database === null) {
    database = buildDatabase();
  }
  return database;
}

export function resetDb(): void {
  database = buildDatabase();
  localStorage.removeItem(SESSION_KEY);
}

export function currentUserId(): string | null {
  return localStorage.getItem(SESSION_KEY);
}

export function setCurrentUserId(id: string | null): void {
  if (id === null) {
    localStorage.removeItem(SESSION_KEY);
  } else {
    localStorage.setItem(SESSION_KEY, id);
  }
}

/** Simulated latency so loading and skeleton states are actually observable. */
export function delay<T>(value: T, ms = 220): Promise<T> {
  return new Promise((resolve) => {
    window.setTimeout(() => resolve(value), ms);
  });
}
