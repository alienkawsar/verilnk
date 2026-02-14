"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTagSchema = exports.setCategoryTagsSchema = exports.updateCategorySchema = exports.createCategorySchema = void 0;
const zod_1 = require("zod");
exports.createCategorySchema = zod_1.z.object({
    name: zod_1.z.string().min(2, 'Name must be at least 2 characters long'),
    slug: zod_1.z.string().min(2).regex(/^[a-z0-9-]+$/).optional(),
    description: zod_1.z.string().max(500).optional(),
    iconKey: zod_1.z.string().max(100).optional(),
    parentId: zod_1.z.string().uuid().optional(),
    sortOrder: zod_1.z.number().int().optional(),
    isActive: zod_1.z.boolean().optional()
});
exports.updateCategorySchema = zod_1.z.object({
    name: zod_1.z.string().min(2, 'Name must be at least 2 characters long').optional(),
    slug: zod_1.z.string().min(2).regex(/^[a-z0-9-]+$/).optional(),
    description: zod_1.z.string().max(500).optional(),
    iconKey: zod_1.z.string().max(100).optional(),
    parentId: zod_1.z.string().uuid().optional().nullable(),
    sortOrder: zod_1.z.number().int().optional(),
    isActive: zod_1.z.boolean().optional()
});
exports.setCategoryTagsSchema = zod_1.z.object({
    tagIds: zod_1.z.array(zod_1.z.string().uuid()).default([])
});
exports.createTagSchema = zod_1.z.object({
    name: zod_1.z.string().min(2, 'Name must be at least 2 characters long'),
    slug: zod_1.z.string().min(2).regex(/^[a-z0-9-]+$/).optional(),
    isActive: zod_1.z.boolean().optional()
});
