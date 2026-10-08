import { PrismaClient } from "@prisma/client";
import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { bootstrapFirstAdmin } from "../src/services/bootstrap-admin.js";

const { values } = parseArgs({ options: {
  email: { type: "string" },
  name: { type: "string" },
  "confirm-create-first-admin": { type: "boolean" },
  help: { type: "boolean" },
}, strict: true });

async function main() {
  if (values.help) {
    console.log('pnpm --filter @remarket/api admin:create --email admin@example.com --name "Tên quản trị viên" --confirm-create-first-admin');
    console.log("Nhập mật khẩu hai lần tại terminal (ẩn ký tự). Chỉ tạo mới khi chưa có admin; không nâng quyền tài khoản có sẵn.");
    return;
  }
  if (!values.email || !values.name || !values["confirm-create-first-admin"]) {
    throw new Error("Cần --email, --name và --confirm-create-first-admin. Dùng --help để xem hướng dẫn.");
  }
  if (!process.stdin.isTTY) throw new Error("Cần terminal tương tác để nhập mật khẩu bảo mật.");
  config({ path: fileURLToPath(new URL("../../../.env", import.meta.url)), quiet: true });
  if (!process.env.DATABASE_URL) throw new Error("Thiếu DATABASE_URL.");

  const mutedOutput = new Writable({ write(_chunk, _encoding, done) { done(); } });
  const readline = createInterface({ input: process.stdin, output: mutedOutput, terminal: true });
  let password: string;
  try {
    process.stdout.write("Mật khẩu mới (ẩn ký tự): ");
    password = await readline.question("");
    process.stdout.write("\nNhập lại mật khẩu (ẩn ký tự): ");
    const confirmation = await readline.question("");
    process.stdout.write("\n");
    if (password !== confirmation) throw new Error("Mật khẩu nhập lại không khớp.");
  } finally {
    readline.close();
  }

  const client = new PrismaClient();
  try {
    const admin = await bootstrapFirstAdmin(client, { email: values.email, full_name: values.name, password });
    console.log(`Đã tạo quản trị viên đầu tiên: ${admin.email} (${admin.id}).`);
  } finally {
    await client.$disconnect();
  }
}

main().catch((error: unknown) => {
  // Database errors can contain connection details; print only known operator validation errors.
  const message = error instanceof Error && !error.name.startsWith("Prisma")
    ? error.message
    : "Không thể tạo admin. Kiểm tra kết nối database và thử lại.";
  console.error(message);
  process.exitCode = 1;
});
