import { PrismaClient } from "@/generated/prisma/client";
import { createPrismaPgAdapter } from "@/lib/prisma-pool";

const globalForPrisma = globalThis;

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: createPrismaPgAdapter(process.env.DATABASE_URL),
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
