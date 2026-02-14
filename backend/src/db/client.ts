import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

console.log("Initializing Prisma Client...");
console.log("DATABASE_URL Env Var:", process.env.DATABASE_URL ? "Defined" : "Undefined");
console.log("DATABASE_URL Length:", process.env.DATABASE_URL?.length);

const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma || new PrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
