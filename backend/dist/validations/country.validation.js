"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateCountrySchema = exports.createCountrySchema = void 0;
const zod_1 = require("zod");
exports.createCountrySchema = zod_1.z.object({
    name: zod_1.z.string().min(2, 'Name must be at least 2 characters long'),
    code: zod_1.z.string().length(2, 'Country code must be exactly 2 characters (ISO 3166-1 alpha-2)')
        .or(zod_1.z.string().length(3, 'Country code must be exactly 3 characters')),
    flagImage: zod_1.z.string().optional(), // Allow relative paths or URLs
    flagImageUrl: zod_1.z.string().url('Must be a valid URL').optional().or(zod_1.z.literal('')),
});
exports.updateCountrySchema = zod_1.z.object({
    name: zod_1.z.string().min(2, 'Name must be at least 2 characters long').optional(),
    code: zod_1.z.string().length(2, 'Country code must be exactly 2 characters')
        .or(zod_1.z.string().length(3, 'Country code must be exactly 3 characters')).optional(),
    flagImage: zod_1.z.string().optional(), // Allow relative paths or URLs
    flagImageUrl: zod_1.z.string().url('Must be a valid URL').optional().or(zod_1.z.literal('')),
    isEnabled: zod_1.z.boolean().optional(),
});
