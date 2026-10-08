import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const openApiPath = fileURLToPath(new URL("../../../docs/openapi.yaml", import.meta.url));
const outputPath = fileURLToPath(new URL("../../../docs/remarket.postman_collection.json", import.meta.url));
const document = YAML.parse(await readFile(openApiPath, "utf8"));

function resolveRef(value) {
  if (!value?.$ref) return value;
  return value.$ref
    .slice(2)
    .split("/")
    .reduce((current, segment) => current[segment], document);
}

function mergeExamples(values) {
  return Object.assign({}, ...values.filter((value) => value && typeof value === "object" && !Array.isArray(value)));
}

function exampleFor(schemaValue, key = "value") {
  const schema = resolveRef(schemaValue) ?? {};
  if (schema.example !== undefined) return schema.example;
  if (Array.isArray(schema.enum) && schema.enum.length > 0) return schema.enum[0];
  if (Array.isArray(schema.allOf)) return mergeExamples(schema.allOf.map((item) => exampleFor(item, key)));
  if (schema.type === "object" || schema.properties) {
    return Object.fromEntries(
      Object.entries(schema.properties ?? {}).map(([property, child]) => [property, exampleFor(child, property)]),
    );
  }
  if (schema.type === "array") return [exampleFor(schema.items, key)];
  if (schema.type === "integer" || schema.type === "number") return schema.minimum ?? 1;
  if (schema.type === "boolean") return true;
  if (schema.format === "uuid" || key === "id" || key.endsWith("_id")) {
    return "00000000-0000-0000-0000-000000000001";
  }
  if (schema.format === "date-time") return "2026-10-06T12:00:00.000Z";
  if (schema.format === "email" || key === "email") return "user@example.com";
  if (schema.format === "password" || key.includes("password")) return "ChangeMe-Only-For-Local-123!";
  if (key === "token") return "{{emailToken}}";
  return "string";
}

function requestBodyFor(operation) {
  const body = resolveRef(operation.requestBody);
  if (!body?.content) return undefined;
  const multipart = body.content["multipart/form-data"];
  if (multipart) {
    const schema = resolveRef(multipart.schema);
    return {
      mode: "formdata",
      formdata: Object.entries(schema.properties ?? {}).map(([key, value]) => ({
        key,
        type: resolveRef(value)?.format === "binary" ? "file" : "text",
        ...(resolveRef(value)?.format === "binary"
          ? { src: [] }
          : { value: String(exampleFor(value, key)) }),
      })),
    };
  }
  const json = body.content["application/json"];
  if (!json) return undefined;
  return {
    mode: "raw",
    raw: JSON.stringify(exampleFor(json.schema), null, 2),
    options: { raw: { language: "json" } },
  };
}

const methods = ["get", "post", "put", "patch", "delete"];
const folders = new Map();
for (const [route, pathItem] of Object.entries(document.paths)) {
  for (const method of methods) {
    const operation = pathItem[method];
    if (!operation) continue;
    const tag = operation.tags?.[0] ?? "Other";
    if (!folders.has(tag)) folders.set(tag, []);
    const pathParameters = [...route.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]);
    const renderedPath = route.replace(/\{([^}]+)\}/g, "{{$1}}");
    const parameters = [...(pathItem.parameters ?? []), ...(operation.parameters ?? [])]
      .map(resolveRef)
      .filter((parameter) => parameter?.in === "query");
    const request = {
      method: method.toUpperCase(),
      header: [],
      url: {
        raw: `{{baseUrl}}${renderedPath}`,
        host: ["{{baseUrl}}"],
        path: renderedPath.replace(/^\//, "").split("/"),
        variable: pathParameters.map((name) => ({ key: name, value: "00000000-0000-0000-0000-000000000001" })),
        query: parameters.map((parameter) => ({
          key: parameter.name,
          value: String(exampleFor(parameter.schema, parameter.name)),
          disabled: !parameter.required,
        })),
      },
      auth: operation.security
        ? { type: "bearer", bearer: [{ key: "token", value: "{{accessToken}}", type: "string" }] }
        : { type: "noauth" },
    };
    const body = requestBodyFor(operation);
    if (body) request.body = body;
    const idempotency = (operation.parameters ?? []).map(resolveRef)
      .find((parameter) => parameter?.in === "header" && parameter.name === "Idempotency-Key");
    if (idempotency) request.header.push({ key: "Idempotency-Key", value: "{{$guid}}", type: "text" });
    folders.get(tag).push({
      name: `${method.toUpperCase()} ${route}`,
      request,
      response: [],
    });
  }
}

const collection = {
  info: {
    name: "ReMarket API",
    description: "Generated from docs/openapi.yaml. Run pnpm --filter @remarket/api postman:generate after changing the API contract.",
    schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
  },
  variable: [
    { key: "baseUrl", value: "http://localhost:3000/api/v1", type: "string" },
    { key: "accessToken", value: "", type: "string" },
    { key: "emailToken", value: "", type: "string" },
    { key: "id", value: "00000000-0000-0000-0000-000000000001", type: "string" },
    { key: "productId", value: "00000000-0000-0000-0000-000000000001", type: "string" },
    { key: "orderId", value: "00000000-0000-0000-0000-000000000001", type: "string" },
    { key: "conversationId", value: "00000000-0000-0000-0000-000000000001", type: "string" },
    { key: "filename", value: "image.webp", type: "string" },
  ],
  event: [{
    listen: "test",
    script: {
      type: "text/javascript",
      exec: [
        "const contentType = pm.response.headers.get('Content-Type') || '';",
        "if (contentType.includes('application/json')) {",
        "  pm.test('Response uses the ReMarket envelope', () => {",
        "    const body = pm.response.json();",
        "    pm.expect(body).to.have.property('success');",
        "    pm.expect(body).to.have.property('meta');",
        "    pm.expect(body.meta).to.have.property('request_id');",
        "  });",
        "}",
      ],
    },
  }],
  item: [...folders.entries()].map(([name, item]) => ({ name, item })),
};

await writeFile(outputPath, `${JSON.stringify(collection, null, 2)}\n`, "utf8");
console.log(`Postman collection written to ${outputPath}`);
