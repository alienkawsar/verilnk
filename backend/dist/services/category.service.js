"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setCategoryTags = exports.createTag = exports.getTags = exports.deleteCategory = exports.updateCategory = exports.createCategory = exports.getCategoryBySlug = exports.getCategoryById = exports.getAdminCategories = exports.getAllCategories = void 0;
const client_1 = require("../db/client");
const slugify_1 = __importDefault(require("slugify"));
const getAllCategories = async () => {
    return client_1.prisma.category.findMany({
        where: { isActive: true },
        orderBy: [
            { sortOrder: 'asc' },
            { name: 'asc' }
        ],
    });
};
exports.getAllCategories = getAllCategories;
const getAdminCategories = async () => {
    return client_1.prisma.category.findMany({
        include: {
            _count: {
                select: {
                    sites: true,
                    organizations: true
                }
            },
            parent: true,
            categoryTags: {
                include: {
                    tag: true
                }
            }
        },
        orderBy: [
            { sortOrder: 'asc' },
            { name: 'asc' }
        ]
    });
};
exports.getAdminCategories = getAdminCategories;
const getCategoryById = async (id) => {
    return client_1.prisma.category.findUnique({
        where: { id },
    });
};
exports.getCategoryById = getCategoryById;
const getCategoryBySlug = async (slug) => {
    return client_1.prisma.category.findUnique({
        where: { slug },
        include: {
            parent: true,
            categoryTags: {
                include: { tag: true }
            }
        }
    });
};
exports.getCategoryBySlug = getCategoryBySlug;
const createCategory = async (data) => {
    const existingCategory = await client_1.prisma.category.findUnique({
        where: { name: data.name },
    });
    if (existingCategory) {
        throw new Error('Category with this name already exists');
    }
    const slug = data.slug
        ? (0, slugify_1.default)(data.slug, { lower: true, strict: true })
        : (0, slugify_1.default)(data.name, { lower: true, strict: true });
    const existingSlug = await client_1.prisma.category.findUnique({
        where: { slug },
    });
    if (existingSlug) {
        throw new Error('Slug already exists. Please choose a different slug.');
    }
    if (data.parentId) {
        const parentExists = await client_1.prisma.category.findUnique({ where: { id: data.parentId } });
        if (!parentExists) {
            throw new Error('Parent category not found');
        }
    }
    return client_1.prisma.category.create({
        data: {
            name: data.name,
            slug,
            description: data.description,
            iconKey: data.iconKey,
            parentId: data.parentId,
            sortOrder: data.sortOrder ?? 0,
            isActive: data.isActive ?? true
        },
    });
};
exports.createCategory = createCategory;
const updateCategory = async (id, data) => {
    // Check if category exists
    const existingCategory = await client_1.prisma.category.findUnique({ where: { id } });
    if (!existingCategory) {
        throw new Error('Category not found');
    }
    const updateData = { ...data };
    if (data.parentId) {
        if (data.parentId === id) {
            throw new Error('Category cannot be its own parent');
        }
        const parentExists = await client_1.prisma.category.findUnique({ where: { id: data.parentId } });
        if (!parentExists) {
            throw new Error('Parent category not found');
        }
    }
    if (data.name) {
        const duplicate = await client_1.prisma.category.findFirst({
            where: {
                name: data.name,
                NOT: { id },
            },
        });
        if (duplicate) {
            throw new Error('Category with this name already exists');
        }
    }
    if (data.slug || data.name) {
        const nextSlug = data.slug
            ? (0, slugify_1.default)(data.slug, { lower: true, strict: true })
            : (0, slugify_1.default)(data.name, { lower: true, strict: true });
        const duplicateSlug = await client_1.prisma.category.findFirst({
            where: {
                slug: nextSlug,
                NOT: { id },
            },
        });
        if (duplicateSlug) {
            throw new Error('Slug already exists. Please choose a different slug.');
        }
        updateData.slug = nextSlug;
    }
    return client_1.prisma.category.update({
        where: { id },
        data: updateData,
    });
};
exports.updateCategory = updateCategory;
const deleteCategory = async (id) => {
    const category = await client_1.prisma.category.findUnique({ where: { id } });
    if (!category) {
        throw new Error('Category not found');
    }
    const [sitesCount, orgsCount] = await Promise.all([
        client_1.prisma.site.count({ where: { categoryId: id } }),
        client_1.prisma.organization.count({ where: { categoryId: id } })
    ]);
    if (sitesCount > 0 || orgsCount > 0) {
        return client_1.prisma.category.update({
            where: { id },
            data: { isActive: false }
        });
    }
    return client_1.prisma.category.delete({
        where: { id },
    });
};
exports.deleteCategory = deleteCategory;
const getTags = async (query) => {
    return client_1.prisma.tag.findMany({
        where: query
            ? {
                OR: [
                    { name: { contains: query, mode: 'insensitive' } },
                    { slug: { contains: query, mode: 'insensitive' } }
                ]
            }
            : undefined,
        orderBy: { name: 'asc' }
    });
};
exports.getTags = getTags;
const createTag = async (data) => {
    const existing = await client_1.prisma.tag.findUnique({ where: { name: data.name } });
    if (existing) {
        throw new Error('Tag with this name already exists');
    }
    const slug = data.slug
        ? (0, slugify_1.default)(data.slug, { lower: true, strict: true })
        : (0, slugify_1.default)(data.name, { lower: true, strict: true });
    const existingSlug = await client_1.prisma.tag.findUnique({ where: { slug } });
    if (existingSlug) {
        throw new Error('Slug already exists. Please choose a different slug.');
    }
    return client_1.prisma.tag.create({
        data: {
            name: data.name,
            slug,
            isActive: data.isActive ?? true
        }
    });
};
exports.createTag = createTag;
const setCategoryTags = async (categoryId, tagIds) => {
    const category = await client_1.prisma.category.findUnique({ where: { id: categoryId } });
    if (!category) {
        throw new Error('Category not found');
    }
    const uniqueIds = Array.from(new Set(tagIds));
    if (uniqueIds.length > 0) {
        const existing = await client_1.prisma.tag.findMany({ where: { id: { in: uniqueIds } } });
        if (existing.length !== uniqueIds.length) {
            throw new Error('One or more tags do not exist');
        }
    }
    await client_1.prisma.categoryTag.deleteMany({ where: { categoryId } });
    if (uniqueIds.length > 0) {
        await client_1.prisma.categoryTag.createMany({
            data: uniqueIds.map(tagId => ({ categoryId, tagId })),
            skipDuplicates: true
        });
    }
};
exports.setCategoryTags = setCategoryTags;
