import { z } from 'zod';

export const createCategorySchema = z.object({
    name: z.string().min(2, 'Name must be at least 2 characters long'),
    slug: z.string().min(2).regex(/^[a-z0-9-]+$/).optional(),
    description: z.string().max(500).optional(),
    iconKey: z.string().max(100).optional(),
    parentId: z.string().uuid().optional(),
    sortOrder: z.number().int().optional(),
    isActive: z.boolean().optional()
});

export const updateCategorySchema = z.object({
    name: z.string().min(2, 'Name must be at least 2 characters long').optional(),
    slug: z.string().min(2).regex(/^[a-z0-9-]+$/).optional(),
    description: z.string().max(500).optional(),
    iconKey: z.string().max(100).optional(),
    parentId: z.string().uuid().optional().nullable(),
    sortOrder: z.number().int().optional(),
    isActive: z.boolean().optional()
});

export const setCategoryTagsSchema = z.object({
    tagIds: z.array(z.string().uuid()).default([])
});

export const createTagSchema = z.object({
    name: z.string().min(2, 'Name must be at least 2 characters long'),
    slug: z.string().min(2).regex(/^[a-z0-9-]+$/).optional(),
    isActive: z.boolean().optional()
});
