import { Request, Response } from 'express';
import * as categoryService from '../services/category.service';
import { createCategorySchema, createTagSchema, setCategoryTagsSchema, updateCategorySchema } from '../validations/category.validation';
import { AuditActionType } from '@prisma/client';
import * as auditService from '../services/audit.service';

export const getCategories = async (req: Request, res: Response): Promise<void> => {
    try {
        const categories = await categoryService.getAllCategories();
        res.json(categories);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching categories' });
    }
};

export const getCategory = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const category = await categoryService.getCategoryById(id as string);
        if (!category) {
            res.status(404).json({ message: 'Category not found' });
            return;
        }
        res.json(category);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching category' });
    }
};

export const createCategory = async (req: Request, res: Response): Promise<void> => {
    try {
        const validation = createCategorySchema.safeParse(req.body);

        if (!validation.success) {
            res.status(400).json({
                message: 'Validation failed',
                errors: validation.error.issues
            });
            return;
        }

        const category = await categoryService.createCategory(validation.data);
        const user = (req as any).user;
        if (user?.id) {
            auditService.logAction({
                adminId: user.id,
                actorRole: user.role,
                action: AuditActionType.CREATE,
                entity: 'Category',
                targetId: category.id,
                details: `Created category ${category.name}`,
                snapshot: category,
                ipAddress: req.ip,
                userAgent: req.headers['user-agent']
            });
        }
        res.status(201).json(category);
    } catch (error: any) {
        res.status(400).json({ message: error.message || 'Error creating category' });
    }
};

export const updateCategory = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const validation = updateCategorySchema.safeParse(req.body);

        if (!validation.success) {
            res.status(400).json({
                message: 'Validation failed',
                errors: validation.error.issues
            });
            return;
        }

        const category = await categoryService.updateCategory(id as string, validation.data);
        const user = (req as any).user;
        if (user?.id) {
            auditService.logAction({
                adminId: user.id,
                actorRole: user.role,
                action: AuditActionType.UPDATE,
                entity: 'Category',
                targetId: category.id,
                details: `Updated category ${category.name}`,
                snapshot: category,
                ipAddress: req.ip,
                userAgent: req.headers['user-agent']
            });
        }
        res.json(category);
    } catch (error: any) {
        if (error.message === 'Category not found') {
            res.status(404).json({ message: error.message });
            return;
        }
        res.status(400).json({ message: error.message || 'Error updating category' });
    }
};

export const deleteCategory = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const category = await categoryService.deleteCategory(id as string);
        const user = (req as any).user;
        if (user?.id) {
            auditService.logAction({
                adminId: user.id,
                actorRole: user.role,
                action: AuditActionType.DELETE,
                entity: 'Category',
                targetId: category.id,
                details: category.isActive === false ? `Disabled category ${category.name}` : `Deleted category ${category.name}`,
                snapshot: category,
                ipAddress: req.ip,
                userAgent: req.headers['user-agent']
            });
        }
        res.json({ message: category.isActive === false ? 'Category disabled successfully' : 'Category deleted successfully' });
    } catch (error: any) {
        if (error.message === 'Category not found') {
            res.status(404).json({ message: error.message });
            return;
        }
        res.status(500).json({ message: 'Error deleting category' });
    }
};

export const getCategoryBySlug = async (req: Request, res: Response): Promise<void> => {
    try {
        const { slug } = req.params;
        const category = await categoryService.getCategoryBySlug(slug as string);
        if (!category) {
            res.status(404).json({ message: 'Category not found' });
            return;
        }
        res.json(category);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching category' });
    }
};

export const getAdminCategories = async (req: Request, res: Response): Promise<void> => {
    try {
        const categories = await categoryService.getAdminCategories();
        res.json(categories);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching categories' });
    }
};

export const getTags = async (req: Request, res: Response): Promise<void> => {
    try {
        const { q } = req.query;
        let query: string | undefined;
        if (typeof q === 'string') {
            query = q;
        } else if (Array.isArray(q)) {
            const first = q[0];
            query = typeof first === 'string' ? first : undefined;
        }
        const tags = await categoryService.getTags(query);
        res.json(tags);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching tags' });
    }
};

export const createTag = async (req: Request, res: Response): Promise<void> => {
    try {
        const validation = createTagSchema.safeParse(req.body);
        if (!validation.success) {
            res.status(400).json({
                message: 'Validation failed',
                errors: validation.error.issues
            });
            return;
        }

        const tag = await categoryService.createTag(validation.data);
        const user = (req as any).user;
        if (user?.id) {
            auditService.logAction({
                adminId: user.id,
                actorRole: user.role,
                action: AuditActionType.CREATE,
                entity: 'Tag',
                targetId: tag.id,
                details: `Created tag ${tag.name}`,
                snapshot: tag,
                ipAddress: req.ip,
                userAgent: req.headers['user-agent']
            });
        }
        res.status(201).json(tag);
    } catch (error: any) {
        res.status(400).json({ message: error.message || 'Error creating tag' });
    }
};

export const setCategoryTags = async (req: Request, res: Response): Promise<void> => {
    try {
        const id = String(req.params.id || '');
        const validation = setCategoryTagsSchema.safeParse(req.body);
        if (!validation.success) {
            res.status(400).json({
                message: 'Validation failed',
                errors: validation.error.issues
            });
            return;
        }

        await categoryService.setCategoryTags(id as string, validation.data.tagIds);
        const user = (req as any).user;
        if (user?.id) {
            auditService.logAction({
                adminId: user.id,
                actorRole: user.role,
                action: AuditActionType.UPDATE,
                entity: 'Category',
                targetId: id,
                details: 'Updated category tags',
                snapshot: { tagIds: validation.data.tagIds },
                ipAddress: req.ip,
                userAgent: req.headers['user-agent']
            });
        }
        res.json({ message: 'Category tags updated successfully' });
    } catch (error: any) {
        res.status(400).json({ message: error.message || 'Error updating category tags' });
    }
};
