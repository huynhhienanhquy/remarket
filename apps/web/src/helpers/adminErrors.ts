import { isApiError } from "@/helpers/errors";

/** Field message from a 422 response, or undefined for other failures. */
export function fieldError(error: unknown, field: string): string | undefined {
  if (!isApiError(error)) return undefined;
  return error.fields?.[field];
}

/** Description line for a toast raised from an ApiError. */
export function errorDescription(error: unknown): string | undefined {
  if (!isApiError(error)) return undefined;
  return error.message !== "" ? error.message : undefined;
}

export function isVersionConflict(error: unknown): boolean {
  return isApiError(error) && error.is("VERSION_CONFLICT");
}
