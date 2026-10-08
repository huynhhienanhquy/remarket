import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { seedReferenceData } from "./reference-data.js";

const prisma = new PrismaClient();

seedReferenceData(prisma)
  .then(() => console.log("Reference data ready: categories and provinces only."))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
