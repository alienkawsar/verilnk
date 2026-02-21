import dotenv from 'dotenv';
dotenv.config();

import { prisma } from './db/client';
import { initializeMeilisearch } from './services/meilisearch.service';
import { ensureJwtSecret } from './config/jwt';
import { validatePaymentConfiguration } from './config/payment.config';

const PORT = process.env.PORT || 8000;
console.log("DB_URL present:", !!process.env.DATABASE_URL);
console.log("Current Directory:", process.cwd());
ensureJwtSecret();
// Fail fast on invalid payment configuration before app bootstrap.
validatePaymentConfiguration();

async function checkDatabase() {
    try {
        // Quick check to see if critical tables exist
        await prisma.bulkImportJob.count();
        console.log('✅ Integrity Check: BulkImportJob table exists');
    } catch (e: any) {
        console.error('❌ CRITICAL ERROR: BulkImportJob table missing or DB unreachable.');
        console.error('❌ Please run: "npx prisma migrate dev" in backend/');
    }
}

const startServer = async () => {
    const { default: app } = await import('./app');
    app.listen(PORT, async () => {
        await checkDatabase();
        await initializeMeilisearch();
        console.log(`Server is running on port ${PORT}`);
    });
};

void startServer().catch((error) => {
    console.error('❌ Server bootstrap failed:', error);
    process.exit(1);
});

const shutdown = async (signal: 'SIGTERM' | 'SIGINT') => {
    console.log(`${signal} received, disconnecting Prisma...`);
    await prisma.$disconnect();
    process.exit(0);
};

process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
});

process.on('SIGINT', () => {
    void shutdown('SIGINT');
});
