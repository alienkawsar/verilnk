import { prisma } from '../db/client';
import { User, AuditActionType } from '@prisma/client';
import bcrypt from 'bcryptjs';
import * as auditService from './audit.service';
import { assertStrongPassword } from '../utils/passwordPolicy';

export const getAllUsers = async (filters: { country?: string; stateId?: string; categoryId?: string; type?: string } = {}): Promise<Omit<User, 'password'>[]> => {
    const { country, type } = filters; // Ignore state/category as requested

    const where: any = {};

    if (country) {
        where.country = country; // Filters by stored country string (UUID or Code)
    }

    if (type === 'general') {
        where.organizationId = null;
    } else if (type === 'organization') {
        where.organizationId = { not: null };
    }

    return prisma.user.findMany({
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

export const getUserById = async (id: string): Promise<User | null> => {
    return prisma.user.findUnique({ where: { id } });
};

export const createUser = async (
    data: { email: string; password: string; firstName: string; lastName: string; country?: string; requestLimit?: number | null; requestLimitWindow?: number; dailyRequestLimit?: number | null },
    auditContext?: { adminId: string; ip?: string; userAgent?: string }
): Promise<Omit<User, 'password'>> => {
    const existingUser = await prisma.user.findUnique({ where: { email: data.email } });
    if (existingUser) {
        throw new Error('User with this email already exists');
    }

    assertStrongPassword(data.password);
    const hashedPassword = await bcrypt.hash(data.password, 10);
    const name = `${data.firstName} ${data.lastName}`;

    const user = await prisma.user.create({
        data: {
            ...data,
            name,
            password: hashedPassword,
        },
    });

    if (auditContext) {
        auditService.logAction({
            adminId: auditContext.adminId,
            action: AuditActionType.CREATE,
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

export const updateUser = async (
    id: string,
    data: Partial<{ email: string; firstName: string; lastName: string; country: string; password?: string; isRestricted?: boolean; dailyRequestLimit?: number | null; requestLimit?: number | null; requestLimitWindow?: number }>,
    auditContext?: { adminId: string; ip?: string; userAgent?: string }
): Promise<Omit<User, 'password'>> => {
    if (data.email) {
        const existing = await prisma.user.findFirst({
            where: {
                email: data.email,
                NOT: { id },
            },
        });
        if (existing) {
            throw new Error('Email already in use');
        }
    }

    let updateData: any = { ...data };

    // Update legacy name field if necessary
    if (data.firstName || data.lastName) {
        const currentUser = await prisma.user.findUnique({ where: { id } });
        if (currentUser) {
            const firstName = data.firstName ?? currentUser.firstName;
            const lastName = data.lastName ?? currentUser.lastName;
            updateData.name = `${firstName} ${lastName}`;
        }
    }

    if (data.password) {
        assertStrongPassword(data.password);
        updateData.password = await bcrypt.hash(data.password, 10);
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

    const beforeState = await prisma.user.findUnique({ where: { id } });

    const user = await prisma.user.update({
        where: { id },
        data: updateData,
    });

    if (auditContext) {
        auditService.logAction({
            adminId: auditContext.adminId,
            action: AuditActionType.UPDATE,
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

export const deleteUser = async (
    id: string,
    auditContext?: { adminId: string; ip?: string; userAgent?: string }
): Promise<void> => {
    const beforeState = await prisma.user.findUnique({ where: { id } });
    await prisma.user.delete({ where: { id } });

    if (auditContext && beforeState) {
        auditService.logAction({
            adminId: auditContext.adminId,
            action: AuditActionType.DELETE,
            entity: 'User',
            targetId: id,
            details: `Deleted user ${beforeState.email}`,
            snapshot: beforeState,
            ipAddress: auditContext.ip,
            userAgent: auditContext.userAgent
        });
    }
};

export const restrictUser = async (id: string, isRestricted: boolean): Promise<User> => {
    // Audit logging handled in controller currently, we can move it here or leave it.
    // Controller already handles it, so leaving as is to avoid double log, 
    // OR ensure controller passes context if we move it here. 
    // The previous code in controller handles it.
    return prisma.user.update({
        where: { id },
        data: { isRestricted },
    });
};

export const deleteUsers = async (
    ids: string[],
    auditContext?: { adminId: string; ip?: string; userAgent?: string }
) => {
    // Using deleteMany for efficiency as deleteUser is simple
    const result = await prisma.user.deleteMany({
        where: { id: { in: ids } }
    });

    if (auditContext) {
        auditService.logAction({
            adminId: auditContext.adminId,
            action: AuditActionType.DELETE,
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

export const updateUsersBulk = async (
    ids: string[],
    data: { dailyRequestLimit?: number | null; requestLimit?: number | null; requestLimitWindow?: number },
    auditContext?: { adminId: string; ip?: string; userAgent?: string }
): Promise<void> => {
    const updateData: any = {};
    if (data.dailyRequestLimit !== undefined) updateData.dailyRequestLimit = data.dailyRequestLimit;
    if (data.requestLimit !== undefined) updateData.requestLimit = data.requestLimit;
    if (data.requestLimitWindow !== undefined) updateData.requestLimitWindow = data.requestLimitWindow;

    if (Object.keys(updateData).length > 0) {
        // Get count before update for logging
        const count = await prisma.user.count({ where: { id: { in: ids } } });

        await prisma.user.updateMany({
            where: { id: { in: ids } },
            data: updateData
        });

        if (auditContext && count > 0) {
            auditService.logAction({
                adminId: auditContext.adminId,
                action: AuditActionType.UPDATE,
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
