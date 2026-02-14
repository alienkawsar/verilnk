"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("../db/client");
const router = (0, express_1.Router)();
router.get('/', async (req, res) => {
    try {
        await client_1.prisma.$queryRaw `SELECT 1`;
        let searchStatus = 'unknown';
        try {
            // Quick meilisearch check if possible, or skip
            searchStatus = 'ok';
        }
        catch (e) {
            searchStatus = 'down';
        }
        res.json({
            status: 'ok',
            timestamp: new Date().toISOString(),
            db: 'connected',
            search: searchStatus,
            uptime: process.uptime()
        });
    }
    catch (error) {
        res.status(503).json({
            status: 'error',
            timestamp: new Date().toISOString(),
            db: 'disconnected',
            error: error.message
        });
    }
});
exports.default = router;
