import { prisma } from '../db/client';
import { Admin, AdminRole } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { assertStrongPassword } from '../utils/passwordPolicy';

export const getAllAdmins = async (filters: { role?: AdminRole; search?: string } = {}): Promise<Omit<Admin, 'password'>[]> => {
    const { role, search } = filters;

    const where: any = { AND: [] };

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

    return prisma.admin.findMany({
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

import * as auditService from './audit.service';
import { AuditActionType } from '@prisma/client';

export const createAdmin = async (
    data: { email: string; password: string; firstName: string; lastName: string; role: AdminRole },
    auditContext?: { adminId: string; ip?: string; userAgent?: string }
): Promise<Omit<Admin, 'password'>> => {
    const existingAdmin = await prisma.admin.findUnique({ where: { email: data.email } });
    if (existingAdmin) {
        throw new Error('Admin with this email already exists');
    }

    assertStrongPassword(data.password);
    const hashedPassword = await bcrypt.hash(data.password, 10);

    const admin = await prisma.admin.create({
        data: {
            ...data,
            password: hashedPassword,
        },
    });

    if (auditContext) {
        auditService.logAction({
            adminId: auditContext.adminId,
            action: AuditActionType.CREATE,
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

export const updateAdmin = async (
    id: string,
    data: Partial<{ email: string; firstName: string; lastName: string; role: AdminRole; password?: string }>,
    auditContext?: { adminId: string; ip?: string; userAgent?: string }
): Promise<Omit<Admin, 'password'>> => {
    // ... existing validation checks ...
    if (data.email) {
        const existing = await prisma.admin.findFirst({
            where: { email: data.email, NOT: { id } }
        });
        if (existing) throw new Error('Email already in use');
    }

    let updateData: any = { ...data };
    if (data.password) {
        assertStrongPassword(data.password);
        updateData.password = await bcrypt.hash(data.password, 10);
    }

    // Get before state for snapshot
    const beforeState = await prisma.admin.findUnique({ where: { id } });

    const admin = await prisma.admin.update({
        where: { id },
        data: updateData,
    });

    if (auditContext) {
        auditService.logAction({
            adminId: auditContext.adminId,
            action: AuditActionType.UPDATE,
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

export const deleteAdmin = async (
    id: string,
    currentAdminId: string,
    auditContext?: { ip?: string; userAgent?: string }
): Promise<void> => {
    if (id === currentAdminId) {
        throw new Error('You cannot delete your own account');
    }

    const beforeState = await prisma.admin.findUnique({ where: { id } });
    await prisma.admin.delete({ where: { id } });

    auditService.logAction({
        adminId: currentAdminId,
        action: AuditActionType.DELETE,
        entity: 'Admin',
        targetId: id,
        details: `Deleted admin ${beforeState?.email}`,
        snapshot: beforeState,
        ipAddress: auditContext?.ip,
        userAgent: auditContext?.userAgent
    });
};

export const getAdminById = async (id: string): Promise<Admin | null> => {
    return prisma.admin.findUnique({ where: { id } });
};
