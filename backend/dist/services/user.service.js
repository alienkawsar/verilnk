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
exports.updateUsersBulk = exports.deleteUsers = exports.restrictUser = exports.deleteUser = exports.updateUser = exports.createUser = exports.getUserById = exports.getAllUsers = void 0;
const client_1 = require("../db/client");
const client_2 = require("@prisma/client");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const auditService = __importStar(require("./audit.service"));
const passwordPolicy_1 = require("../utils/passwordPolicy");
const getAllUsers = async (filters = {}) => {
    const { country, type } = filters; // Ignore state/category as requested
    const where = {};
    if (country) {
        where.country = country; // Filters by stored country string (UUID or Code)
    }
    if (type === 'general') {
        where.organizationId = null;
    }
    else if (type === 'organization') {
        where.organizationId = { not: null };
    }
    return client_1.prisma.user.findMany({
        where,
        select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            name: true,
            country: true,
            createdAt: true,
            updatedAt: true,
            organizationId: true,
            isRestricted: true,
            dailyRequestLimit: true, // Return this field
            requestLimit: true,
            requestLimitWindow: true,
            mustChangePassword: true,
            tokenVersion: true,
            organization: {
                select: {
                    name: true,
                    country: true
                }
            }
        },
        orderBy: {
            createdAt: 'desc',
        },
    });
};
exports.getAllUsers = getAllUsers;
const getUserById = async (id) => {
    return client_1.prisma.user.findUnique({ where: { id } });
};
exports.getUserById = getUserById;
const createUser = async (data, auditContext) => {
    const existingUser = await client_1.prisma.user.findUnique({ where: { email: data.email } });
    if (existingUser) {
        throw new Error('User with this email already exists');
    }
    (0, passwordPolicy_1.assertStrongPassword)(data.password);
    const hashedPassword = await bcryptjs_1.default.hash(data.password, 10);
    const name = `${data.firstName} ${data.lastName}`;
    const user = await client_1.prisma.user.create({
        data: {
            ...data,
            name,
            password: hashedPassword,
        },
    });
    if (auditContext) {
        auditService.logAction({
            adminId: auditContext.adminId,
            action: client_2.AuditActionType.CREATE,
            entity: 'User',
            targetId: user.id,
            details: `Created user ${user.email}`,
            snapshot: user,
            ipAddress: auditContext.ip,
            userAgent: auditContext.userAgent
        });
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, ...result } = user;
    return result;
};
exports.createUser = createUser;
const updateUser = async (id, data, auditContext) => {
    if (data.email) {
        const existing = await client_1.prisma.user.findFirst({
            where: {
                email: data.email,
                NOT: { id },
            },
        });
        if (existing) {
            throw new Error('Email already in use');
        }
    }
    let updateData = { ...data };
    // Update legacy name field if necessary
    if (data.firstName || data.lastName) {
        const currentUser = await client_1.prisma.user.findUnique({ where: { id } });
        if (currentUser) {
            const firstName = data.firstName ?? currentUser.firstName;
            const lastName = data.lastName ?? currentUser.lastName;
            updateData.name = `${firstName} ${lastName}`;
        }
    }
    if (data.password) {
        (0, passwordPolicy_1.assertStrongPassword)(data.password);
        updateData.password = await bcryptjs_1.default.hash(data.password, 10);
    }
    // Explicitly handle optional fields if needed, but spread ...data usually works unless explicit validation filters them out
    if (data.dailyRequestLimit !== undefined) {
        updateData.dailyRequestLimit = data.dailyRequestLimit;
    }
    if (data.requestLimit !== undefined) {
        updateData.requestLimit = data.requestLimit;
    }
    if (data.requestLimitWindow !== undefined) {
        updateData.requestLimitWindow = data.requestLimitWindow;
    }
    const beforeState = await client_1.prisma.user.findUnique({ where: { id } });
    const user = await client_1.prisma.user.update({
        where: { id },
        data: updateData,
    });
    if (auditContext) {
        auditService.logAction({
            adminId: auditContext.adminId,
            action: client_2.AuditActionType.UPDATE,
            entity: 'User',
            targetId: user.id,
            details: `Updated user profile for ${user.email}`,
            snapshot: { before: beforeState, after: user },
            ipAddress: auditContext.ip,
            userAgent: auditContext.userAgent
        });
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password: _, ...result } = user;
    return result;
};
exports.updateUser = updateUser;
const deleteUser = async (id, auditContext) => {
    const beforeState = await client_1.prisma.user.findUnique({ where: { id } });
    await client_1.prisma.user.delete({ where: { id } });
    if (auditContext && beforeState) {
        auditService.logAction({
            adminId: auditContext.adminId,
            action: client_2.AuditActionType.DELETE,
            entity: 'User',
            targetId: id,
            details: `Deleted user ${beforeState.email}`,
            snapshot: beforeState,
            ipAddress: auditContext.ip,
            userAgent: auditContext.userAgent
        });
    }
};
exports.deleteUser = deleteUser;
const restrictUser = async (id, isRestricted) => {
    // Audit logging handled in controller currently, we can move it here or leave it.
    // Controller already handles it, so leaving as is to avoid double log, 
    // OR ensure controller passes context if we move it here. 
    // The previous code in controller handles it.
    return client_1.prisma.user.update({
        where: { id },
        data: { isRestricted },
    });
};
exports.restrictUser = restrictUser;
const deleteUsers = async (ids, auditContext) => {
    // Using deleteMany for efficiency as deleteUser is simple
    const result = await client_1.prisma.user.deleteMany({
        where: { id: { in: ids } }
    });
    if (auditContext) {
        auditService.logAction({
            adminId: auditContext.adminId,
            action: client_2.AuditActionType.DELETE,
            entity: 'User',
            targetId: 'BULK',
            details: `Bulk deleted ${result.count} users`,
            snapshot: { ids, count: result.count },
            ipAddress: auditContext.ip,
            userAgent: auditContext.userAgent
        });
    }
    return result;
};
exports.deleteUsers = deleteUsers;
const updateUsersBulk = async (ids, data, auditContext) => {
    const updateData = {};
    if (data.dailyRequestLimit !== undefined)
        updateData.dailyRequestLimit = data.dailyRequestLimit;
    if (data.requestLimit !== undefined)
        updateData.requestLimit = data.requestLimit;
    if (data.requestLimitWindow !== undefined)
        updateData.requestLimitWindow = data.requestLimitWindow;
    if (Object.keys(updateData).length > 0) {
        // Get count before update for logging
        const count = await client_1.prisma.user.count({ where: { id: { in: ids } } });
        await client_1.prisma.user.updateMany({
            where: { id: { in: ids } },
            data: updateData
        });
        if (auditContext && count > 0) {
            auditService.logAction({
                adminId: auditContext.adminId,
                action: client_2.AuditActionType.UPDATE,
                entity: 'User',
                targetId: 'BULK',
                details: `Bulk updated ${count} users with ${JSON.stringify(updateData)}`,
                snapshot: { ids, updateData },
                ipAddress: auditContext.ip,
                userAgent: auditContext.userAgent
            });
        }
    }
};
exports.updateUsersBulk = updateUsersBulk;
