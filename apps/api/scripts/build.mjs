import { spawnSync } from "node:child_process";
import { readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distRoot = path.join(apiRoot, "dist");

await rm(distRoot, { recursive: true, force: true });

const tscPath = path.join(apiRoot, "node_modules", "typescript", "lib", "tsc.js");
const compiled = spawnSync(process.execPath, [tscPath, "-p", path.join(apiRoot, "tsconfig.json")], {
  cwd: apiRoot,
  stdio: "inherit",
});
if (compiled.status !== 0) process.exit(compiled.status ?? 1);

const apiOutput = path.join(distRoot, "apps", "api", "src");
const sharedEntry = path.join(distRoot, "packages", "shared", "src", "index.js");

async function javascriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await javascriptFiles(absolute)));
    else if (entry.isFile() && entry.name.endsWith(".js")) files.push(absolute);
  }
  return files;
}

if (!(await stat(sharedEntry).catch(() => null))) {
  throw new Error(`Missing compiled shared entry: ${sharedEntry}`);
}

for (const file of await javascriptFiles(apiOutput)) {
  let relative = path.relative(path.dirname(file), sharedEntry).replaceAll(path.sep, "/");
  if (!relative.startsWith(".")) relative = `./${relative}`;
  const source = await readFile(file, "utf8");
  const rewritten = source
    .replaceAll('"@remarket/shared"', `"${relative}"`)
    .replaceAll("'@remarket/shared'", `'${relative}'`);
  if (rewritten !== source) await writeFile(file, rewritten, "utf8");
}

console.log(`Backend build written to ${apiOutput}`);
