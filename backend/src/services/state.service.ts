import { prisma } from '../db/client';
import { State, AuditActionType } from '@prisma/client';
import * as auditService from './audit.service';

export const getAllStates = async (countryId?: string): Promise<State[]> => {
    return prisma.state.findMany({
        where: countryId ? { countryId } : {},
        orderBy: { name: 'asc' },
        include: { country: true }
    });
};

export const getStateById = async (id: string): Promise<State | null> => {
    return prisma.state.findUnique({
        where: { id },
        include: { country: true }
    });
};

export const createState = async (data: {
    name: string;
    code?: string;
    countryId: string;
}, auditContext?: { adminId: string; ip?: string; userAgent?: string }): Promise<State> => {
    // Check uniqueness within country
    const existing = await prisma.state.findFirst({
        where: {
            name: data.name,
            countryId: data.countryId
        }
    });

    if (existing) {
        throw new Error(`State "${data.name}" already exists in this country`);
    }

    const state = await prisma.state.create({
        data
    });

    if (auditContext) {
        auditService.logAction({
            adminId: auditContext.adminId,
            action: AuditActionType.CREATE,
            entity: 'State',
            targetId: state.id,
            details: `Created state ${state.name} in country ${state.countryId}`,
            snapshot: state,
            ipAddress: auditContext.ip,
            userAgent: auditContext.userAgent
        });
    }

    return state;
};

export const updateState = async (id: string, data: {
    name?: string;
    code?: string;
    countryId?: string;
}, auditContext?: { adminId: string; ip?: string; userAgent?: string }): Promise<State> => {
    if (data.name && data.countryId) {
        const existing = await prisma.state.findFirst({
            where: {
                name: data.name,
                countryId: data.countryId,
                NOT: { id }
            }
        });
        if (existing) {
            throw new Error(`State "${data.name}" already exists in this country`);
        }
    }

    const beforeState = await prisma.state.findUnique({ where: { id } });

    const state = await prisma.state.update({
        where: { id },
        data
    });

    if (auditContext) {
        auditService.logAction({
            adminId: auditContext.adminId,
            action: AuditActionType.UPDATE,
            entity: 'State',
            targetId: state.id,
            details: `Updated state ${state.name}`,
            snapshot: { before: beforeState, after: state },
            ipAddress: auditContext.ip,
            userAgent: auditContext.userAgent
        });
    }

    return state;
};

export const deleteState = async (id: string, auditContext?: { adminId: string; ip?: string; userAgent?: string }): Promise<State> => {
    // Check dependencies (Sites)
    const sitesCount = await prisma.site.count({
        where: { stateId: id }
    });

    if (sitesCount > 0) {
        throw new Error(`Cannot delete state with ${sitesCount} associated sites`);
    }

    const beforeState = await prisma.state.findUnique({ where: { id } });

    const state = await prisma.state.delete({
        where: { id }
    });

    if (auditContext && beforeState) {
        auditService.logAction({
            adminId: auditContext.adminId,
            action: AuditActionType.DELETE,
            entity: 'State',
            targetId: state.id,
            details: `Deleted state ${state.name}`,
            snapshot: beforeState,
            ipAddress: auditContext.ip,
            userAgent: auditContext.userAgent
        });
    }

    return state;
};
