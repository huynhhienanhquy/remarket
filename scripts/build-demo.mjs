import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
// Process values take precedence over any developer's apps/web/.env file.
const buildEnv = {
  ...process.env,
  VITE_API_BASE_URL: "/api/v1",
  VITE_SOCKET_URL: "",
  VITE_EMAIL_ENABLED: "false",
};
// Use the installed, lockfile-pinned tools directly. Production builds need
// their dev dependencies throughout this sequence, including Prisma and tsc.
const steps = [
  ["apps/api", "node_modules/prisma/build/index.js", ["generate"]],
  ["packages/shared", "node_modules/typescript/bin/tsc", ["-p", "tsconfig.json", "--noEmit"]],
  ["apps/api", "scripts/build.mjs", []],
  ["apps/web", "node_modules/vite/bin/vite.js", ["build"]],
];
for (const [directory, entry, args] of steps) {
  const result = spawnSync(process.execPath, [entry, ...args], {
    cwd: path.join(root, directory),
    env: buildEnv,
    stdio: "inherit",
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
