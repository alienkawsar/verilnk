import { z } from 'zod';

export const createCountrySchema = z.object({
    name: z.string().min(2, 'Name must be at least 2 characters long'),
    code: z.string().length(2, 'Country code must be exactly 2 characters (ISO 3166-1 alpha-2)')
        .or(z.string().length(3, 'Country code must be exactly 3 characters')),
    flagImage: z.string().optional(), // Allow relative paths or URLs
    flagImageUrl: z.string().url('Must be a valid URL').optional().or(z.literal('')),
});

export const updateCountrySchema = z.object({
    name: z.string().min(2, 'Name must be at least 2 characters long').optional(),
    code: z.string().length(2, 'Country code must be exactly 2 characters')
        .or(z.string().length(3, 'Country code must be exactly 3 characters')).optional(),
    flagImage: z.string().optional(), // Allow relative paths or URLs
    flagImageUrl: z.string().url('Must be a valid URL').optional().or(z.literal('')),
    isEnabled: z.boolean().optional(),
});
