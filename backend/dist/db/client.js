"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
require("dotenv/config");
const client_1 = require("@prisma/client");
console.log("Initializing Prisma Client...");
console.log("DATABASE_URL Env Var:", process.env.DATABASE_URL ? "Defined" : "Undefined");
console.log("DATABASE_URL Length:", process.env.DATABASE_URL?.length);
const globalForPrisma = global;
exports.prisma = globalForPrisma.prisma || new client_1.PrismaClient();
if (process.env.NODE_ENV !== 'production')
    globalForPrisma.prisma = exports.prisma;
