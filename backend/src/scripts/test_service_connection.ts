
import { prisma } from '../db/client';

async function main() {
    console.log('Testing shared Prisma client connection...');
    try {
        const count = await prisma.user.count();
        console.log(`✅ Connected! User count: ${count}`);
    } catch (error) {
        console.error('❌ Connection failed:', error);
    } finally {
        await prisma.$disconnect();
    }
}

main();
