import { Request, Response } from 'express';
import * as meilisearchService from '../services/meilisearch.service';
import { checkAndExpirePriorities } from '../services/organization.service';
import * as analyticsService from '../services/analytics.service';
import crypto from 'crypto';

// 1. Normalize Input (Lowercase, Trim, Remove Special Chars)
const normalizeInput = (text: string): string => {
    if (!text) return '';
    return text.toLowerCase()
        .replace(/[^a-z0-9\s]/g, '') // Keep only letters, numbers, spaces
        .replace(/\s+/g, ' ')
        .trim();
};

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number, message: string) => {
    let timeoutHandle: NodeJS.Timeout | null = null;
    const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => reject(new Error(message)), timeoutMs);
    });

    try {
        return await Promise.race([promise, timeoutPromise]);
    } finally {
        if (timeoutHandle) {
            clearTimeout(timeoutHandle);
        }
    }
};

export const searchSites = async (req: Request, res: Response): Promise<void> => {
    try {
        const { q, country, category, page, limit, stateId } = req.query;

        // 1. Strict Validation: Country is MANDATORY
        if (!country || typeof country !== 'string') {
            res.status(400).json({
                message: 'Strict Filter Violation: Country code is required for search.'
            });
            return;
        }

        const rawQuery = (q as string) || '';
        // console.log(`[SearchController] Incoming Query: "${rawQuery}"`); 

        // Strict Check: If query became empty or [unk]
        if (rawQuery.trim().toLowerCase() === '[unk]') {
            res.json({ hits: [], total: 0, limit: 20, offset: 0 });
            return;
        }

        // Normalize
        const query = normalizeInput(rawQuery);

        const countryIso = await meilisearchService.resolveCountryIso(country as string);
        if (!countryIso) {
            res.status(400).json({
                message: 'Strict Filter Violation: Valid country code is required for search.'
            });
            return;
        }

        // 2. Construct Strict Filters
        const filters = {
            countryIso,
            state_id: stateId as string | undefined,
            category_id: category as string | undefined,
            isApproved: true            // Always true for public search
        };

        const pageNum = parseInt(page as string) || 1;
        const limitNum = parseInt(limit as string) || 20;
        const offset = (pageNum - 1) * limitNum;

        await checkAndExpirePriorities().catch(console.error);

        // 3. Perform Search
        const results = await withTimeout(
            meilisearchService.searchSites(
                query,
                {
                    countryIso: filters.countryIso,
                    stateId: filters.state_id,
                    categoryId: filters.category_id,
                    isApproved: filters.isApproved
                },
                { limit: limitNum, offset }
            ),
            5000,
            'Search service timed out'
        );

        // 4. Track Analytics (Async, Fire-and-forget)
        /* 
           Anonymize IP: Hash it to respect privacy while allowing unique visitor counting.
           Use X-Forwarded-For if behind proxy, else req.ip.
        */
        const ip = (req.headers['x-forwarded-for'] as string) || req.ip || 'unknown';
        const ipHash = crypto.createHash('sha256').update(ip).digest('hex');

        analyticsService.trackSearch(
            query,
            filters,
            results.total,
            ipHash
        );

        res.json(results);
    } catch (error: any) {
        console.error('Search error:', error);
        if (error?.message?.includes('timed out')) {
            res.status(504).json({ message: 'Search timed out. Please try again.' });
            return;
        }
        res.status(500).json({ message: error.message || 'Error performing search' });
    }
};
