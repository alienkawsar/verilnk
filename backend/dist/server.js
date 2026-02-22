"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const client_1 = require("./db/client");
const meilisearch_service_1 = require("./services/meilisearch.service");
const jwt_1 = require("./config/jwt");
const payment_config_1 = require("./config/payment.config");
const PORT = process.env.PORT || 8000;
const isProduction = process.env.NODE_ENV === 'production';
if (!isProduction) {
    console.log('DB_URL present:', !!process.env.DATABASE_URL);
    console.log('Current Directory:', process.cwd());
}
(0, jwt_1.ensureJwtSecret)();
// Fail fast on invalid payment configuration before app bootstrap.
try {
    (0, payment_config_1.validatePaymentConfiguration)();
}
catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const appUrlHint = message.includes('APP_URL')
        ? ' Set APP_URL=http://localhost:3000 (dev).'
        : '';
    console.error(`❌ Payment configuration invalid: ${message}${appUrlHint}`);
    process.exit(1);
}
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
const startServer = async () => {
    const { default: app } = await Promise.resolve().then(() => __importStar(require('./app')));
    app.listen(PORT, async () => {
        await checkDatabase();
        await (0, meilisearch_service_1.initializeMeilisearch)();
        console.log(`Server is running on port ${PORT}`);
    });
};
void startServer().catch((error) => {
    console.error('❌ Server bootstrap failed:', error);
    process.exit(1);
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
