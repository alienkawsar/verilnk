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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAdminById = exports.deleteAdmin = exports.updateAdmin = exports.createAdmin = exports.getAllAdmins = void 0;
const client_1 = require("../db/client");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const passwordPolicy_1 = require("../utils/passwordPolicy");
const getAllAdmins = async (filters = {}) => {
    const { role, search } = filters;
    const where = { AND: [] };
    if (role) {
        where.AND.push({ role });
    }
    if (search) {
        where.AND.push({
            OR: [
                { email: { contains: search, mode: 'insensitive' } },
                { firstName: { contains: search, mode: 'insensitive' } },
                { lastName: { contains: search, mode: 'insensitive' } },
            ]
        });
    }
    return client_1.prisma.admin.findMany({
        where,
        select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
            createdAt: true,
            updatedAt: true,
        },
        orderBy: {
            createdAt: 'desc',
        },
    });
};
exports.getAllAdmins = getAllAdmins;
const auditService = __importStar(require("./audit.service"));
const client_2 = require("@prisma/client");
const createAdmin = async (data, auditContext) => {
    const existingAdmin = await client_1.prisma.admin.findUnique({ where: { email: data.email } });
    if (existingAdmin) {
        throw new Error('Admin with this email already exists');
    }
    (0, passwordPolicy_1.assertStrongPassword)(data.password);
    const hashedPassword = await bcryptjs_1.default.hash(data.password, 10);
    const admin = await client_1.prisma.admin.create({
        data: {
            ...data,
            password: hashedPassword,
        },
    });
    if (auditContext) {
        auditService.logAction({
            adminId: auditContext.adminId,
            action: client_2.AuditActionType.CREATE,
            entity: 'Admin',
            targetId: admin.id,
            details: `Created admin ${admin.email} with role ${admin.role}`,
            snapshot: admin,
            ipAddress: auditContext.ip,
            userAgent: auditContext.userAgent
        });
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, ...result } = admin;
    return result;
};
exports.createAdmin = createAdmin;
const updateAdmin = async (id, data, auditContext) => {
    // ... existing validation checks ...
    if (data.email) {
        const existing = await client_1.prisma.admin.findFirst({
            where: { email: data.email, NOT: { id } }
        });
        if (existing)
            throw new Error('Email already in use');
    }
    let updateData = { ...data };
    if (data.password) {
        (0, passwordPolicy_1.assertStrongPassword)(data.password);
        updateData.password = await bcryptjs_1.default.hash(data.password, 10);
    }
    // Get before state for snapshot
    const beforeState = await client_1.prisma.admin.findUnique({ where: { id } });
    const admin = await client_1.prisma.admin.update({
        where: { id },
        data: updateData,
    });
    if (auditContext) {
        auditService.logAction({
            adminId: auditContext.adminId,
            action: client_2.AuditActionType.UPDATE,
            entity: 'Admin',
            targetId: admin.id,
            details: `Updated admin profile for ${admin.email}`,
            snapshot: { before: beforeState, after: admin },
            ipAddress: auditContext.ip,
            userAgent: auditContext.userAgent
        });
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, ...result } = admin;
    return result;
};
exports.updateAdmin = updateAdmin;
const deleteAdmin = async (id, currentAdminId, auditContext) => {
    if (id === currentAdminId) {
        throw new Error('You cannot delete your own account');
    }
    const beforeState = await client_1.prisma.admin.findUnique({ where: { id } });
    await client_1.prisma.admin.delete({ where: { id } });
    auditService.logAction({
        adminId: currentAdminId,
        action: client_2.AuditActionType.DELETE,
        entity: 'Admin',
        targetId: id,
        details: `Deleted admin ${beforeState?.email}`,
        snapshot: beforeState,
        ipAddress: auditContext?.ip,
        userAgent: auditContext?.userAgent
    });
};
exports.deleteAdmin = deleteAdmin;
const getAdminById = async (id) => {
    return client_1.prisma.admin.findUnique({ where: { id } });
};
exports.getAdminById = getAdminById;
