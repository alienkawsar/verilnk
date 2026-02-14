"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const meilisearch_service_1 = require("../services/meilisearch.service");
const client_1 = require("../db/client");
const run = async () => {
    try {
        console.log('Running re-indexing script...');
        const result = await (0, meilisearch_service_1.reindexAllSites)();
        if (result) {
            console.log(`Successfully re-indexed ${result.count} documents.`);
            console.log(`Task UID: ${result.taskUid}`);
        }
        else {
            console.log('Re-indexing finished with no documents processed (or no sites found).');
        }
    }
    catch (error) {
        console.error('Re-indexing script failed:', error);
        process.exit(1);
    }
    finally {
        await client_1.prisma.$disconnect();
    }
};
run();
