import dotenv from 'dotenv';
dotenv.config();

import app from './app';
import { prisma } from './db/client';
import { initializeMeilisearch } from './services/meilisearch.service';
import { ensureJwtSecret } from './config/jwt';

const PORT = process.env.PORT || 8000;
console.log("DB_URL present:", !!process.env.DATABASE_URL);
console.log("Current Directory:", process.cwd());
ensureJwtSecret();

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

app.listen(PORT, async () => {
    await checkDatabase();
    await initializeMeilisearch();
    console.log(`Server is running on port ${PORT}`);
});
