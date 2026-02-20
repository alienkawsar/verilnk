"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("../db/client");
async function main() {
    console.log('Testing shared Prisma client connection...');
    try {
        const count = await client_1.prisma.user.count();
        console.log(`✅ Connected! User count: ${count}`);
    }
    catch (error) {
        console.error('❌ Connection failed:', error);
    }
    finally {
        await client_1.prisma.$disconnect();
    }
}
main();
