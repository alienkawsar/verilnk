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
exports.searchSites = void 0;
const meilisearchService = __importStar(require("../services/meilisearch.service"));
const organization_service_1 = require("../services/organization.service");
const analyticsService = __importStar(require("../services/analytics.service"));
const crypto_1 = __importDefault(require("crypto"));
// 1. Normalize Input (Lowercase, Trim, Remove Special Chars)
const normalizeInput = (text) => {
    if (!text)
        return '';
    return text.toLowerCase()
        .replace(/[^a-z0-9\s]/g, '') // Keep only letters, numbers, spaces
        .replace(/\s+/g, ' ')
        .trim();
};
const withTimeout = async (promise, timeoutMs, message) => {
    let timeoutHandle = null;
    const timeoutPromise = new Promise((_, reject) => {
        timeoutHandle = setTimeout(() => reject(new Error(message)), timeoutMs);
    });
    try {
        return await Promise.race([promise, timeoutPromise]);
    }
    finally {
        if (timeoutHandle) {
            clearTimeout(timeoutHandle);
        }
    }
};
const searchSites = async (req, res) => {
    try {
        const { q, country, category, page, limit, stateId } = req.query;
        // 1. Strict Validation: Country is MANDATORY
        if (!country || typeof country !== 'string') {
            res.status(400).json({
                message: 'Strict Filter Violation: Country code is required for search.'
            });
            return;
        }
        const rawQuery = q || '';
        // console.log(`[SearchController] Incoming Query: "${rawQuery}"`); 
        // Strict Check: If query became empty or [unk]
        if (rawQuery.trim().toLowerCase() === '[unk]') {
            res.json({ hits: [], total: 0, limit: 20, offset: 0 });
            return;
        }
        // Normalize
        const query = normalizeInput(rawQuery);
        const countryIso = await meilisearchService.resolveCountryIso(country);
        if (!countryIso) {
            res.status(400).json({
                message: 'Strict Filter Violation: Valid country code is required for search.'
            });
            return;
        }
        // 2. Construct Strict Filters
        const filters = {
            countryIso,
            state_id: stateId,
            category_id: category,
            isApproved: true // Always true for public search
        };
        const pageNum = parseInt(page) || 1;
        const limitNum = parseInt(limit) || 20;
        const offset = (pageNum - 1) * limitNum;
        await (0, organization_service_1.checkAndExpirePriorities)().catch(console.error);
        // 3. Perform Search
        const results = await withTimeout(meilisearchService.searchSites(query, {
            countryIso: filters.countryIso,
            stateId: filters.state_id,
            categoryId: filters.category_id,
            isApproved: filters.isApproved
        }, { limit: limitNum, offset }), 5000, 'Search service timed out');
        // 4. Track Analytics (Async, Fire-and-forget)
        /*
           Anonymize IP: Hash it to respect privacy while allowing unique visitor counting.
           Use X-Forwarded-For if behind proxy, else req.ip.
        */
        const ip = req.headers['x-forwarded-for'] || req.ip || 'unknown';
        const ipHash = crypto_1.default.createHash('sha256').update(ip).digest('hex');
        analyticsService.trackSearch(query, filters, results.total, ipHash);
        res.json(results);
    }
    catch (error) {
        console.error('Search error:', error);
        if (error?.message?.includes('timed out')) {
            res.status(504).json({ message: 'Search timed out. Please try again.' });
            return;
        }
        res.status(500).json({ message: error.message || 'Error performing search' });
    }
};
exports.searchSites = searchSites;
