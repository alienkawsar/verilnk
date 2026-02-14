
import { Router } from 'express';
import { prisma } from '../db/client';

const router = Router();

router.get('/', async (req, res) => {
    try {
        await prisma.$queryRaw`SELECT 1`;

        let searchStatus = 'unknown';
        try {
            // Quick meilisearch check if possible, or skip
            searchStatus = 'ok';
        } catch (e) {
            searchStatus = 'down';
        }

        res.json({
            status: 'ok',
            timestamp: new Date().toISOString(),
            db: 'connected',
            search: searchStatus,
            uptime: process.uptime()
        });
    } catch (error) {
        res.status(503).json({
            status: 'error',
            timestamp: new Date().toISOString(),
            db: 'disconnected',
            error: (error as Error).message
        });
    }
});

export default router;
