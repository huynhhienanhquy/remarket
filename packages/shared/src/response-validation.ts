import contracts from "./response-contracts.js";

interface Schema {
  $ref?: string; type?: string; nullable?: boolean; required?: readonly string[];
  properties?: Record<string, Schema>; items?: Schema; enum?: readonly unknown[];
  allOf?: readonly Schema[]; anyOf?: readonly Schema[]; oneOf?: readonly Schema[];
  pattern?: string; minimum?: number; maximum?: number;
}
const schemas = contracts.schemas as Record<string, Schema>;

/** Generated from OpenAPI: response types are checked before entering the cache. */
function matches(value: unknown, schema: Schema, depth = 0, trace?: { path?: string }, path = "$" ): boolean {
  const fail = (at = path) => { if (trace && !trace.path) trace.path = at; return false; };
  if (depth > 64) return fail();
  if (value === null && schema.nullable) return true;
  if (schema.$ref) {
    const target = schemas[schema.$ref.split("/").at(-1) ?? ""];
    return !!target && matches(value, target, depth + 1, trace, path);
  }
  if (schema.allOf && !schema.allOf.every((part) => matches(value, part, depth + 1, trace, path))) return fail();
  if (schema.anyOf && !schema.anyOf.some((part) => matches(value, part, depth + 1))) return fail();
  if (schema.oneOf && schema.oneOf.filter((part) => matches(value, part, depth + 1)).length !== 1) return fail();
  if (schema.enum && !schema.enum.includes(value)) return fail();
  if (schema.type === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)) return fail();
    const record = value as Record<string, unknown>;
    const missing = schema.required?.find((key) => !(key in record));
    if (missing) return fail(`${path}.${missing}`);
    for (const [key, property] of Object.entries(schema.properties ?? {})) {
      if (key in record && !matches(record[key], property, depth + 1, trace, `${path}.${key}`)) return fail();
    }
  } else if (schema.type === "array") {
    if (!Array.isArray(value) || (schema.items && !value.every((item, index) => matches(item, schema.items!, depth + 1, trace, `${path}[${index}]`)))) return fail();
  } else if (schema.type === "string") {
    if (typeof value !== "string" || (schema.pattern && !new RegExp(schema.pattern).test(value))) return fail();
  } else if (schema.type === "number" || schema.type === "integer") {
    if (typeof value !== "number" || !Number.isFinite(value) || (schema.type === "integer" && !Number.isInteger(value))) return fail();
    if (schema.minimum !== undefined && value < schema.minimum) return fail();
    if (schema.maximum !== undefined && value > schema.maximum) return fail();
  } else if (schema.type === "boolean" && typeof value !== "boolean") return fail();
  return true;
}

const routes = contracts.routes.map((route) => ({ ...route,
  pattern: new RegExp(`^${route.path.split("/").map((part) => part.startsWith("{") ? "[^/]+" : part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("/")}/?$`),
}));

export function apiSuccessStatus(path: string, method: string): number | undefined {
  return routes.find((entry) => entry.method === method && entry.pattern.test(path))?.status;
}

export function validApiResponse(path: string, method: string, status: number, payload: unknown): boolean {
  const route = routes.find((entry) => entry.method === method && entry.status === status && entry.pattern.test(path));
  return !!route && matches(payload, route.schema as Schema);
}

export function apiResponseIssue(path: string, method: string, status: number, payload: unknown): string | null {
  const route = routes.find((entry) => entry.method === method && entry.status === status && entry.pattern.test(path));
  if (!route) return "Undocumented response: " + method + " " + path + " " + status;
  const trace: { path?: string } = {};
  return matches(payload, route.schema as Schema, 0, trace) ? null : trace.path ?? "$";
}
