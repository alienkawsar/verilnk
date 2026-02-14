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
Object.defineProperty(exports, "__esModule", { value: true });
exports.setCategoryTags = exports.createTag = exports.getTags = exports.getAdminCategories = exports.getCategoryBySlug = exports.deleteCategory = exports.updateCategory = exports.createCategory = exports.getCategory = exports.getCategories = void 0;
const categoryService = __importStar(require("../services/category.service"));
const category_validation_1 = require("../validations/category.validation");
const client_1 = require("@prisma/client");
const auditService = __importStar(require("../services/audit.service"));
const getCategories = async (req, res) => {
    try {
        const categories = await categoryService.getAllCategories();
        res.json(categories);
    }
    catch (error) {
        res.status(500).json({ message: 'Error fetching categories' });
    }
};
exports.getCategories = getCategories;
const getCategory = async (req, res) => {
    try {
        const { id } = req.params;
        const category = await categoryService.getCategoryById(id);
        if (!category) {
            res.status(404).json({ message: 'Category not found' });
            return;
        }
        res.json(category);
    }
    catch (error) {
        res.status(500).json({ message: 'Error fetching category' });
    }
};
exports.getCategory = getCategory;
const createCategory = async (req, res) => {
    try {
        const validation = category_validation_1.createCategorySchema.safeParse(req.body);
        if (!validation.success) {
            res.status(400).json({
                message: 'Validation failed',
                errors: validation.error.issues
            });
            return;
        }
        const category = await categoryService.createCategory(validation.data);
        const user = req.user;
        if (user?.id) {
            auditService.logAction({
                adminId: user.id,
                actorRole: user.role,
                action: client_1.AuditActionType.CREATE,
                entity: 'Category',
                targetId: category.id,
                details: `Created category ${category.name}`,
                snapshot: category,
                ipAddress: req.ip,
                userAgent: req.headers['user-agent']
            });
        }
        res.status(201).json(category);
    }
    catch (error) {
        res.status(400).json({ message: error.message || 'Error creating category' });
    }
};
exports.createCategory = createCategory;
const updateCategory = async (req, res) => {
    try {
        const { id } = req.params;
        const validation = category_validation_1.updateCategorySchema.safeParse(req.body);
        if (!validation.success) {
            res.status(400).json({
                message: 'Validation failed',
                errors: validation.error.issues
            });
            return;
        }
        const category = await categoryService.updateCategory(id, validation.data);
        const user = req.user;
        if (user?.id) {
            auditService.logAction({
                adminId: user.id,
                actorRole: user.role,
                action: client_1.AuditActionType.UPDATE,
                entity: 'Category',
                targetId: category.id,
                details: `Updated category ${category.name}`,
                snapshot: category,
                ipAddress: req.ip,
                userAgent: req.headers['user-agent']
            });
        }
        res.json(category);
    }
    catch (error) {
        if (error.message === 'Category not found') {
            res.status(404).json({ message: error.message });
            return;
        }
        res.status(400).json({ message: error.message || 'Error updating category' });
    }
};
exports.updateCategory = updateCategory;
const deleteCategory = async (req, res) => {
    try {
        const { id } = req.params;
        const category = await categoryService.deleteCategory(id);
        const user = req.user;
        if (user?.id) {
            auditService.logAction({
                adminId: user.id,
                actorRole: user.role,
                action: client_1.AuditActionType.DELETE,
                entity: 'Category',
                targetId: category.id,
                details: category.isActive === false ? `Disabled category ${category.name}` : `Deleted category ${category.name}`,
                snapshot: category,
                ipAddress: req.ip,
                userAgent: req.headers['user-agent']
            });
        }
        res.json({ message: category.isActive === false ? 'Category disabled successfully' : 'Category deleted successfully' });
    }
    catch (error) {
        if (error.message === 'Category not found') {
            res.status(404).json({ message: error.message });
            return;
        }
        res.status(500).json({ message: 'Error deleting category' });
    }
};
exports.deleteCategory = deleteCategory;
const getCategoryBySlug = async (req, res) => {
    try {
        const { slug } = req.params;
        const category = await categoryService.getCategoryBySlug(slug);
        if (!category) {
            res.status(404).json({ message: 'Category not found' });
            return;
        }
        res.json(category);
    }
    catch (error) {
        res.status(500).json({ message: 'Error fetching category' });
    }
};
exports.getCategoryBySlug = getCategoryBySlug;
const getAdminCategories = async (req, res) => {
    try {
        const categories = await categoryService.getAdminCategories();
        res.json(categories);
    }
    catch (error) {
        res.status(500).json({ message: 'Error fetching categories' });
    }
};
exports.getAdminCategories = getAdminCategories;
const getTags = async (req, res) => {
    try {
        const { q } = req.query;
        let query;
        if (typeof q === 'string') {
            query = q;
        }
        else if (Array.isArray(q)) {
            const first = q[0];
            query = typeof first === 'string' ? first : undefined;
        }
        const tags = await categoryService.getTags(query);
        res.json(tags);
    }
    catch (error) {
        res.status(500).json({ message: 'Error fetching tags' });
    }
};
exports.getTags = getTags;
const createTag = async (req, res) => {
    try {
        const validation = category_validation_1.createTagSchema.safeParse(req.body);
        if (!validation.success) {
            res.status(400).json({
                message: 'Validation failed',
                errors: validation.error.issues
            });
            return;
        }
        const tag = await categoryService.createTag(validation.data);
        const user = req.user;
        if (user?.id) {
            auditService.logAction({
                adminId: user.id,
                actorRole: user.role,
                action: client_1.AuditActionType.CREATE,
                entity: 'Tag',
                targetId: tag.id,
                details: `Created tag ${tag.name}`,
                snapshot: tag,
                ipAddress: req.ip,
                userAgent: req.headers['user-agent']
            });
        }
        res.status(201).json(tag);
    }
    catch (error) {
        res.status(400).json({ message: error.message || 'Error creating tag' });
    }
};
exports.createTag = createTag;
const setCategoryTags = async (req, res) => {
    try {
        const id = String(req.params.id || '');
        const validation = category_validation_1.setCategoryTagsSchema.safeParse(req.body);
        if (!validation.success) {
            res.status(400).json({
                message: 'Validation failed',
                errors: validation.error.issues
            });
            return;
        }
        await categoryService.setCategoryTags(id, validation.data.tagIds);
        const user = req.user;
        if (user?.id) {
            auditService.logAction({
                adminId: user.id,
                actorRole: user.role,
                action: client_1.AuditActionType.UPDATE,
                entity: 'Category',
                targetId: id,
                details: 'Updated category tags',
                snapshot: { tagIds: validation.data.tagIds },
                ipAddress: req.ip,
                userAgent: req.headers['user-agent']
            });
        }
        res.json({ message: 'Category tags updated successfully' });
    }
    catch (error) {
        res.status(400).json({ message: error.message || 'Error updating category tags' });
    }
};
exports.setCategoryTags = setCategoryTags;
