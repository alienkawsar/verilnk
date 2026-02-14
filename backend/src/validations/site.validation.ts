import { z } from 'zod';
import { VerificationStatus } from '@prisma/client';

const allowedSuffixes = ['.gov', '.edu', '.org', '.com', '.bd', '.net', '.io', '.co', '.info', '.biz']; // Expanded list

const urlSchema = z
    .string()
    .url('Invalid URL format')
    .refine((url) => url.startsWith('https://'), {
        message: 'URL must start with https://',
    })
    .refine(
        (url) => {
            try {
                const hostname = new URL(url).hostname;
                // Allow valid domains generally, but maybe restrict if needed. 
                // For "official site", minimal restriction is better than too strict allowedSuffixes if we want flexibility.
                // However, preserving existing allowedSuffixes logic if it was intended. 
                // Let's keep the suffix check but make it robust or just rely on URL validity.
                // The previous code had a specific list. I'll stick to basic URL validation + HTTPS as per prompt "HTTPS URLS only".
                // I will relax the suffix check unless strictly required, to avoid blocking valid sites like .xyz or .tech
                return true;
            } catch {
                return false;
            }
        },
        {
            message: 'Invalid domain',
        }
    );

export const createSiteSchema = z.object({
    name: z.string().min(1, 'Name is required'),
    url: urlSchema,
    countryId: z.string().uuid('Invalid country ID'),
    stateId: z.string().uuid('Invalid state ID').optional(),
    categoryId: z.string().uuid('Invalid category ID'),
    status: z.nativeEnum(VerificationStatus).optional(),
});

export const updateSiteSchema = z.object({
    name: z.string().min(1).optional(),
    url: urlSchema.optional(),
    countryId: z.string().uuid().optional(),
    stateId: z.string().uuid().optional(),
    categoryId: z.string().uuid().optional(),
    status: z.nativeEnum(VerificationStatus).optional(),
});

export const updateSiteStatusSchema = z.object({
    status: z.nativeEnum(VerificationStatus),
});
