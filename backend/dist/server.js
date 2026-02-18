"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const app_1 = __importDefault(require("./app"));
const client_1 = require("./db/client");
const meilisearch_service_1 = require("./services/meilisearch.service");
const jwt_1 = require("./config/jwt");
const PORT = process.env.PORT || 8000;
console.log("DB_URL present:", !!process.env.DATABASE_URL);
console.log("Current Directory:", process.cwd());
(0, jwt_1.ensureJwtSecret)();
async function checkDatabase() {
    try {
        // Quick check to see if critical tables exist
        await client_1.prisma.bulkImportJob.count();
        console.log('✅ Integrity Check: BulkImportJob table exists');
    }
    catch (e) {
        console.error('❌ CRITICAL ERROR: BulkImportJob table missing or DB unreachable.');
        console.error('❌ Please run: "npx prisma migrate dev" in backend/');
    }
}
app_1.default.listen(PORT, async () => {
    await checkDatabase();
    await (0, meilisearch_service_1.initializeMeilisearch)();
    console.log(`Server is running on port ${PORT}`);
});
const shutdown = async (signal) => {
    console.log(`${signal} received, disconnecting Prisma...`);
    await client_1.prisma.$disconnect();
    process.exit(0);
};
process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
});
process.on('SIGINT', () => {
    void shutdown('SIGINT');
});
