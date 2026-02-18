"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
require("dotenv/config");
const adapter_pg_1 = require("@prisma/adapter-pg");
const client_1 = require("@prisma/client");
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
    const adapter = new adapter_pg_1.PrismaPg({
        connectionString: databaseUrl,
        max: poolMax,
        idleTimeoutMillis: 10000,
        connectionTimeoutMillis: 5000,
        ssl: { rejectUnauthorized: false },
    });
    return new client_1.PrismaClient({ adapter });
}
const globalForPrisma = global;
exports.prisma = globalForPrisma.prisma || createPrismaClient();
if (process.env.NODE_ENV !== 'production')
    globalForPrisma.prisma = exports.prisma;
