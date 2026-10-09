import { isApiError } from "@/helpers/errors";

/** 422 payloads expose field messages from the API envelope. */
export function fieldMessages(caught: unknown): Record<string, string> | null {
  if (!isApiError(caught)) return null;
  const raw = caught.fields ?? caught.details?.fields;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const messages: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string" && value !== "") messages[key] = value;
  }
  return Object.keys(messages).length > 0 ? messages : null;
}
