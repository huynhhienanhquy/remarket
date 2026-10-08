import { Prisma } from "@prisma/client";

/** PostgreSQL raw lock statements report serialization/deadlock as P2010. */
export function isTransactionConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && (
    error.code === "P2034" ||
    (error.code === "P2010" && ["40001", "40P01"].includes(String(error.meta?.code)))
  );
}
