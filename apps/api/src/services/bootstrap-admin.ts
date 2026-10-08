import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { validateEmail, validateFullName, validatePassword } from "@remarket/shared";

/** Operator-only bootstrap. No HTTP route may call this service. */
export async function bootstrapFirstAdmin(
  client: PrismaClient,
  input: { email: string; full_name: string; password: string },
) {
  const email = input.email.trim().toLowerCase();
  const fullName = input.full_name.trim();
  const error = validateEmail(email) ?? validateFullName(fullName) ?? validatePassword(input.password);
  if (error) throw new Error(error);
  const passwordHash = await bcrypt.hash(input.password, 12);

  return client.$transaction(async (tx) => {
    // All invocations use the same transaction lock; at most one can bootstrap.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(761204, 1)::text`;
    if (await tx.user.count({ where: { role: "ADMIN" } })) {
      throw new Error("Đã có quản trị viên. Lệnh chỉ dùng để tạo admin đầu tiên.");
    }
    if (await tx.user.findUnique({ where: { email }, select: { id: true } })) {
      throw new Error("Email đã được sử dụng. Lệnh không nâng quyền tài khoản hiện có.");
    }
    const admin = await tx.user.create({
      data: { email, fullName, passwordHash, role: "ADMIN", status: "ACTIVE", emailVerifiedAt: new Date() },
      select: { id: true, email: true, fullName: true },
    });
    await tx.auditLog.create({
      data: {
        actorId: admin.id,
        actorName: admin.fullName,
        actorType: "ADMIN",
        action: "admin.bootstrap",
        entityType: "user",
        entityId: admin.id,
        reason: "Tạo quản trị viên đầu tiên bằng lệnh vận hành.",
        metadata: { source: "operator_cli" },
      },
    });
    return admin;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
