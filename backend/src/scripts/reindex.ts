import { reindexAllSites } from '../services/meilisearch.service';
import { prisma } from '../db/client';

const run = async () => {
    try {
        console.log('Running re-indexing script...');
        const result = await reindexAllSites();

        if (result) {
            console.log(`Successfully re-indexed ${result.count} documents.`);
            console.log(`Task UID: ${result.taskUid}`);
        } else {
            console.log('Re-indexing finished with no documents processed (or no sites found).');
        }
    } catch (error) {
        console.error('Re-indexing script failed:', error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
};

run();
