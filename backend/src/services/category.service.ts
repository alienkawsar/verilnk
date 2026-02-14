import { prisma } from '../db/client';
import { Category, Tag } from '@prisma/client';
import slugify from 'slugify';

export const getAllCategories = async (): Promise<Category[]> => {
    return prisma.category.findMany({
        where: { isActive: true },
        orderBy: [
            { sortOrder: 'asc' },
            { name: 'asc' }
        ],
    });
};

export const getAdminCategories = async () => {
    return prisma.category.findMany({
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

export const getCategoryById = async (id: string): Promise<Category | null> => {
    return prisma.category.findUnique({
        where: { id },
    });
};

export const getCategoryBySlug = async (slug: string) => {
    return prisma.category.findUnique({
        where: { slug },
        include: {
            parent: true,
            categoryTags: {
                include: { tag: true }
            }
        }
    });
};

export const createCategory = async (data: {
    name: string;
    slug?: string;
    description?: string;
    iconKey?: string;
    parentId?: string;
    sortOrder?: number;
    isActive?: boolean;
}): Promise<Category> => {
    const existingCategory = await prisma.category.findUnique({
        where: { name: data.name },
    });

    if (existingCategory) {
        throw new Error('Category with this name already exists');
    }

    const slug = data.slug
        ? slugify(data.slug, { lower: true, strict: true })
        : slugify(data.name, { lower: true, strict: true });

    const existingSlug = await prisma.category.findUnique({
        where: { slug },
    });

    if (existingSlug) {
        throw new Error('Slug already exists. Please choose a different slug.');
    }

    if (data.parentId) {
        const parentExists = await prisma.category.findUnique({ where: { id: data.parentId } });
        if (!parentExists) {
            throw new Error('Parent category not found');
        }
    }

    return prisma.category.create({
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

export const updateCategory = async (
    id: string,
    data: { name?: string; slug?: string; description?: string; iconKey?: string; parentId?: string | null; sortOrder?: number; isActive?: boolean }
): Promise<Category> => {
    // Check if category exists
    const existingCategory = await prisma.category.findUnique({ where: { id } });
    if (!existingCategory) {
        throw new Error('Category not found');
    }

    const updateData: any = { ...data };

    if (data.parentId) {
        if (data.parentId === id) {
            throw new Error('Category cannot be its own parent');
        }
        const parentExists = await prisma.category.findUnique({ where: { id: data.parentId } });
        if (!parentExists) {
            throw new Error('Parent category not found');
        }
    }

    if (data.name) {
        const duplicate = await prisma.category.findFirst({
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
            ? slugify(data.slug, { lower: true, strict: true })
            : slugify(data.name as string, { lower: true, strict: true });

        const duplicateSlug = await prisma.category.findFirst({
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

    return prisma.category.update({
        where: { id },
        data: updateData,
    });
};

export const deleteCategory = async (id: string): Promise<Category> => {
    const category = await prisma.category.findUnique({ where: { id } });
    if (!category) {
        throw new Error('Category not found');
    }

    const [sitesCount, orgsCount] = await Promise.all([
        prisma.site.count({ where: { categoryId: id } }),
        prisma.organization.count({ where: { categoryId: id } })
    ]);

    if (sitesCount > 0 || orgsCount > 0) {
        return prisma.category.update({
            where: { id },
            data: { isActive: false }
        });
    }

    return prisma.category.delete({
        where: { id },
    });
};

export const getTags = async (query?: string): Promise<Tag[]> => {
    return prisma.tag.findMany({
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

export const createTag = async (data: { name: string; slug?: string; isActive?: boolean }): Promise<Tag> => {
    const existing = await prisma.tag.findUnique({ where: { name: data.name } });
    if (existing) {
        throw new Error('Tag with this name already exists');
    }

    const slug = data.slug
        ? slugify(data.slug, { lower: true, strict: true })
        : slugify(data.name, { lower: true, strict: true });

    const existingSlug = await prisma.tag.findUnique({ where: { slug } });
    if (existingSlug) {
        throw new Error('Slug already exists. Please choose a different slug.');
    }

    return prisma.tag.create({
        data: {
            name: data.name,
            slug,
            isActive: data.isActive ?? true
        }
    });
};

export const setCategoryTags = async (categoryId: string, tagIds: string[]): Promise<void> => {
    const category = await prisma.category.findUnique({ where: { id: categoryId } });
    if (!category) {
        throw new Error('Category not found');
    }

    const uniqueIds = Array.from(new Set(tagIds));
    if (uniqueIds.length > 0) {
        const existing = await prisma.tag.findMany({ where: { id: { in: uniqueIds } } });
        if (existing.length !== uniqueIds.length) {
            throw new Error('One or more tags do not exist');
        }
    }

    await prisma.categoryTag.deleteMany({ where: { categoryId } });

    if (uniqueIds.length > 0) {
        await prisma.categoryTag.createMany({
            data: uniqueIds.map(tagId => ({ categoryId, tagId })),
            skipDuplicates: true
        });
    }
};
