import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { API_ERROR_CODES } from "@remarket/shared";
import YAML from "yaml";
import { describe, expect, it } from "vitest";

type HttpMethod = "get" | "post" | "put" | "patch" | "delete";
type OpenApiNode = Record<string, unknown>;

const requiredOperations: Array<[string, HttpMethod]> = [
  ["/auth/register", "post"], ["/auth/login", "post"], ["/auth/refresh", "post"],
  ["/auth/bootstrap", "post"],
  ["/auth/me", "get"], ["/auth/logout", "post"], ["/auth/logout-all", "post"],
  ["/auth/verify-email", "post"], ["/auth/resend-verification", "post"],
  ["/auth/forgot-password", "post"], ["/auth/reset-password", "post"],
  ["/auth/profile", "patch"], ["/auth/avatar", "patch"], ["/categories", "get"],
  ["/provinces", "get"], ["/products", "get"], ["/products", "post"],
  ["/products/{id}", "get"], ["/products/{id}", "patch"], ["/products/{id}", "delete"],
  ["/products/{id}/submit", "post"], ["/products/{id}/hide", "post"],
  ["/account/products", "get"], ["/uploads", "post"], ["/uploads/{filename}", "get"],
  ["/favorites", "get"], ["/favorites/{productId}", "put"],
  ["/favorites/{productId}", "delete"], ["/cart", "get"], ["/cart/items", "post"],
  ["/cart/items/{productId}", "delete"], ["/checkout", "post"], ["/orders", "get"],
  ["/orders/{id}", "get"], ["/orders/{id}/actions", "post"],
  ["/orders/{orderId}/reviews", "post"], ["/conversations", "get"],
  ["/conversations", "post"], ["/conversations/{conversationId}/messages", "get"],
  ["/conversations/{conversationId}/messages", "post"],
  ["/conversations/{conversationId}/read", "post"], ["/users/{id}", "get"],
  ["/users/{id}/products", "get"], ["/users/{id}/reviews", "get"],
  ["/reports", "post"], ["/reports/mine", "get"], ["/notifications", "get"],
  ["/notifications/unread-count", "get"], ["/notifications/{id}/read", "post"],
  ["/notifications/read-all", "post"], ["/support/tickets", "get"],
  ["/support/tickets", "post"], ["/support/tickets/{id}", "get"],
  ["/support/tickets/{id}/messages", "post"], ["/support/tickets/{id}/close", "post"],
  ["/admin/dashboard", "get"], ["/admin/users", "get"], ["/admin/users/{id}", "get"],
  ["/admin/users/{id}/lock", "post"], ["/admin/users/{id}/unlock", "post"],
  ["/admin/products", "get"], ["/admin/products/{id}/approve", "post"],
  ["/admin/products/{id}/reject", "post"], ["/admin/products/{id}/block", "post"],
  ["/admin/products/{id}/unblock", "post"], ["/admin/categories", "post"],
  ["/admin/categories", "get"], ["/admin/categories/tree", "get"],
  ["/admin/categories/{id}", "patch"], ["/admin/reports", "get"],
  ["/admin/reports/{id}/resolve", "post"], ["/admin/reports/{id}/reject", "post"],
  ["/admin/reviews", "get"], ["/admin/reviews/{id}/hide", "post"],
  ["/admin/support-tickets", "get"], ["/admin/support-tickets/{id}", "get"],
  ["/admin/support-tickets/{id}", "patch"], ["/admin/support-tickets/{id}/messages", "post"],
  ["/admin/audit-logs", "get"], ["/admin/orders/{id}/cancel", "post"],
];

function asNode(value: unknown): OpenApiNode {
  expect(value).toBeTypeOf("object");
  expect(value).not.toBeNull();
  return value as OpenApiNode;
}

function resolveRef(document: OpenApiNode, ref: string): unknown {
  expect(ref.startsWith("#/"), `Only local refs are supported: ${ref}`).toBe(true);
  return ref
    .slice(2)
    .split("/")
    .reduce<unknown>((current, segment) => asNode(current)[segment], document);
}

function visit(value: unknown, callback: (node: OpenApiNode) => void): void {
  if (Array.isArray(value)) {
    for (const item of value) visit(item, callback);
    return;
  }
  if (value === null || typeof value !== "object") return;
  const node = value as OpenApiNode;
  callback(node);
  for (const child of Object.values(node)) visit(child, callback);
}

describe("OpenAPI contract", () => {
  it("covers every implemented frontend/backend operation with unique operation IDs", async () => {
    const path = fileURLToPath(new URL("../../../../docs/openapi.yaml", import.meta.url));
    const document = asNode(YAML.parse(await readFile(path, "utf8")));
    expect(document.openapi).toBe("3.0.3");
    const paths = asNode(document.paths);
    const operationIds = new Set<string>();

    for (const [route, method] of requiredOperations) {
      const pathItem = asNode(paths[route]);
      const operation = asNode(pathItem[method]);
      expect(operation.responses, `${method.toUpperCase()} ${route} responses`).toBeTruthy();
      expect(operation.operationId, `${method.toUpperCase()} ${route} operationId`).toBeTypeOf("string");
      expect(operationIds.has(operation.operationId as string), `duplicate ${String(operation.operationId)}`).toBe(false);
      for (const [status, responseValue] of Object.entries(asNode(operation.responses))) {
        if (!status.startsWith("2") || typeof responseValue !== "object" || responseValue === null) {
          continue;
        }
        expect(
          (responseValue as OpenApiNode).$ref,
          `${method.toUpperCase()} ${route} ${status} must not use the catch-all success response`,
        ).not.toBe("#/components/responses/Success");
      }
      operationIds.add(operation.operationId as string);
    }
    expect(operationIds.size).toBe(requiredOperations.length);
  });

  it("contains no broken local references or catch-all JSON request body", async () => {
    const path = fileURLToPath(new URL("../../../../docs/openapi.yaml", import.meta.url));
    const document = asNode(YAML.parse(await readFile(path, "utf8")));
    const requestBodies = asNode(asNode(document.components).requestBodies);
    expect(requestBodies).not.toHaveProperty("JsonBody");
    expect(requestBodies).not.toHaveProperty("VersionedBody");

    visit(document, (node) => {
      if (typeof node.$ref === "string") {
        expect(resolveRef(document, node.$ref), `broken ref ${node.$ref}`).toBeDefined();
      }
    });
  });

  it("keeps the documented error-code enum aligned with the shared contract", async () => {
    const path = fileURLToPath(new URL("../../../../docs/openapi.yaml", import.meta.url));
    const document = asNode(YAML.parse(await readFile(path, "utf8")));
    const schemas = asNode(asNode(document.components).schemas);
    const errorCodes = asNode(schemas.ApiErrorCode).enum;

    expect(errorCodes).toEqual(Object.values(API_ERROR_CODES));
    expect(
      asNode(asNode(asNode(schemas.ErrorEnvelope).properties).error).properties,
    ).toMatchObject({ code: { $ref: "#/components/schemas/ApiErrorCode" } });
  });

  it("documents a valid machine-error set for every operation", async () => {
    const path = fileURLToPath(new URL("../../../../docs/openapi.yaml", import.meta.url));
    const document = asNode(YAML.parse(await readFile(path, "utf8")));
    const matrix = asNode(document["x-operation-error-codes"]);
    const operationIds = requiredOperations.map(([route, method]) => {
      return String(asNode(asNode(asNode(document.paths)[route])[method]).operationId);
    });
    expect(Object.keys(matrix).sort()).toEqual([...operationIds].sort());

    const allowed = new Set(Object.values(API_ERROR_CODES));
    for (const operationId of operationIds) {
      const codes = matrix[operationId];
      expect(Array.isArray(codes), `${operationId} error codes`).toBe(true);
      expect((codes as unknown[]).length, `${operationId} error codes`).toBeGreaterThan(0);
      expect(new Set(codes as unknown[]).size, `${operationId} duplicate error codes`).toBe(
        (codes as unknown[]).length,
      );
      for (const code of codes as unknown[]) {
        expect(allowed.has(String(code) as (typeof API_ERROR_CODES)[keyof typeof API_ERROR_CODES]))
          .toBe(true);
      }
    }
  });

  it("keeps the generated Postman collection in sync with OpenAPI", async () => {
    const path = fileURLToPath(
      new URL("../../../../docs/remarket.postman_collection.json", import.meta.url),
    );
    const collection = JSON.parse(await readFile(path, "utf8")) as {
      item?: Array<{ item?: Array<{ name?: string }> }>;
    };
    const requestNames = new Set(
      (collection.item ?? []).flatMap((folder) => folder.item ?? []).map((item) => item.name),
    );
    expect(requestNames.size).toBe(requiredOperations.length);
    for (const [route, method] of requiredOperations) {
      expect(requestNames.has(`${method.toUpperCase()} ${route}`)).toBe(true);
    }
  });

  it("keeps every live frontend HTTP call aligned with an OpenAPI method and path", async () => {
    const openApiPath = fileURLToPath(new URL("../../../../docs/openapi.yaml", import.meta.url));
    const adapterPath = fileURLToPath(
      new URL("../../../web/src/lib/api/httpAdapter.ts", import.meta.url),
    );
    const document = asNode(YAML.parse(await readFile(openApiPath, "utf8")));
    const openApiOperations = new Set<string>();
    for (const [route, pathValue] of Object.entries(asNode(document.paths))) {
      for (const method of ["get", "post", "put", "patch", "delete"] as const) {
        if (asNode(pathValue)[method]) {
          openApiOperations.add(`${method.toUpperCase()} ${route.replace(/\{[^}]+\}/g, "{}")}`);
        }
      }
    }

    const source = await readFile(adapterPath, "utf8");
    const callPattern = /http\.(getOrNull|get|post|put|patch|delete)(?:<[^>]+>)?\(\s*([`"'])(\/[^`"']+)\2/g;
    const calls = [...source.matchAll(callPattern)].map((match) => {
      const method = match[1] === "getOrNull" ? "GET" : match[1]!.toUpperCase();
      const route = match[3]!.replace(/\$\{[^}]+\}/g, "{}");
      return `${method} ${route}`;
    });

    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(openApiOperations.has(call), `undocumented live adapter call ${call}`).toBe(true);
    }
  });
});
