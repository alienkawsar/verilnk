import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

if (process.env.NODE_ENV !== 'production') {
  console.log("Initializing Prisma Client...");
  console.log("DATABASE_URL Env Var:", process.env.DATABASE_URL ? "Defined" : "Undefined");
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is not defined');
}
const configuredPoolMax = Number(process.env.PRISMA_POOL_MAX ?? 20);
const poolMax = Number.isFinite(configuredPoolMax) && configuredPoolMax > 0 ? configuredPoolMax : 20;

function createPrismaClient() {
  const adapter = new PrismaPg({
    connectionString: databaseUrl,
    max: poolMax,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 5_000,
    ssl: { rejectUnauthorized: false },
  });

  return new PrismaClient({ adapter });
}

const globalForPrisma = global as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma || createPrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
