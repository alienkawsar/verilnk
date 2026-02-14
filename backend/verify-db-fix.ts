
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    try {
        const count = await prisma.bulkImportJob.count();
        console.log(`✅ BulkImportJob table exists. Current count: ${count}`);
    } catch (error) {
        console.error('❌ Failed to access BulkImportJob table:', error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

main();
