import { prisma } from '../db/client';
import { RequestStatus, RequestType } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { indexSite } from './meilisearch.service';
import { isStrongPassword, STRONG_PASSWORD_MESSAGE } from '../utils/passwordPolicy';

// Define expected payload types for better type safety (optional but good)
export interface CreateRequestData {
    type: RequestType;
    payload: any; // JSON
    requesterId: string;
    organizationId?: string;
}

// Helper to get start of day in UTC (or consistent server time)
const getStartOfDay = (date: Date) => {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    return start;
};

export const getUserRequestUsage = async (userId: string) => {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { dailyRequestLimit: true, requestLimit: true, requestLimitWindow: true }
    });

    if (!user) return { used: 0, limit: null, window: 1, remaining: null };

    // Determine effective limit and window
    let limit = user.requestLimit;
    let windowDays = user.requestLimitWindow || 1;

    // Fallback to legacy
    if (limit === null && user.dailyRequestLimit !== null) {
        limit = user.dailyRequestLimit;
        windowDays = 1;
    }

    if (limit === null) return { used: 0, limit: null, window: windowDays, remaining: null };

    // Calculate window start
    const windowStart = new Date();
    windowStart.setDate(windowStart.getDate() - windowDays);

    // Count
    const used = await prisma.changeRequest.count({
        where: {
            requesterId: userId,
            createdAt: {
                gte: windowStart
            }
        }
    });

    return {
        used,
        limit,
        window: windowDays,
        remaining: Math.max(0, limit - used)
    };
};

export const createRequest = async (data: CreateRequestData) => {
    // 1. Check Request Limit for User
    const user = await prisma.user.findUnique({
        where: { id: data.requesterId },
        select: { dailyRequestLimit: true, requestLimit: true, requestLimitWindow: true }
    });

    if (user) {
        let limit = user.requestLimit;
        let windowDays = user.requestLimitWindow || 1;

        // Fallback to legacy daily limit if new limit is not set
        if (limit === null && user.dailyRequestLimit !== null) {
            limit = user.dailyRequestLimit;
            windowDays = 1;
        }

        if (limit !== null) {
            // Calculate window start date (rolling window)
            const windowStart = new Date();
            windowStart.setDate(windowStart.getDate() - windowDays);

            // Count requests created by this user within the window
            const requestsInWindow = await prisma.changeRequest.count({
                where: {
                    requesterId: data.requesterId,
                    createdAt: {
                        gte: windowStart
                    }
                }
            });

            if (requestsInWindow >= limit) {
                throw new Error(`You have reached your request limit for this period.`);
            }
        }
    }

    // 2. Create Request
    return prisma.changeRequest.create({
        data: {
            type: data.type,
            payload: data.payload, // Prisma handles JSON automatically
            requesterId: data.requesterId,
            organizationId: data.organizationId,
            status: RequestStatus.PENDING,
        },
    });
};

export const getRequests = async (filters: any) => {
    return prisma.changeRequest.findMany({
        where: filters,
        include: {
            requester: {
                select: { id: true, name: true, email: true },
            },
            organization: {
                select: { id: true, name: true },
            },
        },
        orderBy: {
            createdAt: 'desc',
        },
    });
};

export const getRequestById = async (id: string) => {
    return prisma.changeRequest.findUnique({
        where: { id },
        include: {
            requester: true,
            organization: true,
        },
    });
};

import * as auditService from './audit.service';
import { AuditActionType } from '@prisma/client';

export const rejectRequest = async (
    id: string,
    adminNotes?: string,
    auditContext?: { adminId: string; ip?: string; userAgent?: string }
) => {
    const result = await prisma.changeRequest.update({
        where: { id },
        data: {
            status: RequestStatus.REJECTED,
            adminNotes,
        },
    });

    if (auditContext) {
        auditService.logAction({
            adminId: auditContext.adminId,
            action: AuditActionType.REJECT,
            entity: 'Request',
            targetId: id,
            details: `Rejected request ${result.type}`,
            snapshot: { adminNotes },
            ipAddress: auditContext.ip,
            userAgent: auditContext.userAgent
        });
    }

    return result;
};

export const approveRequest = async (
    id: string,
    auditContext?: { adminId: string; ip?: string; userAgent?: string }
) => {
    const request = await prisma.changeRequest.findUnique({ where: { id } });
    if (!request) throw new Error('Request not found');
    if (request.status !== RequestStatus.PENDING) throw new Error('Request is not pending');

    const payload = request.payload as any;
    console.log(`[ApproveRequest] Processing ${request.type} for ${id}`, payload);

    // --- USER PROFILE UPDATE ---
    if (request.type === RequestType.USER_UPDATE) {
        return prisma.$transaction(async (tx) => {
            const userExists = await tx.user.findUnique({ where: { id: request.requesterId } });
            if (!userExists) {
                console.warn(`[ApproveRequest] User ${request.requesterId} missing. Auto-rejecting.`);
                return tx.changeRequest.update({
                    where: { id },
                    data: { status: RequestStatus.REJECTED, adminNotes: 'User not found' }
                });
            }

            // Explit Payload Sanitization (Whitelist approach)
            const updateData: any = {};
            if (payload.firstName && typeof payload.firstName === 'string') updateData.firstName = payload.firstName;
            if (payload.lastName && typeof payload.lastName === 'string') updateData.lastName = payload.lastName;
            if (payload.country && typeof payload.country === 'string') updateData.country = payload.country;

            // Handle Email (Unique Check)
            if (payload.email && typeof payload.email === 'string' && payload.email !== userExists.email) {
                const conflict = await tx.user.findFirst({
                    where: { email: payload.email, NOT: { id: request.requesterId } }
                });
                if (conflict) throw new Error('Email already in use');
                updateData.email = payload.email;
            }

            // Handle Password
            if (payload.password && typeof payload.password === 'string') {
                if (!isStrongPassword(payload.password)) {
                    throw new Error(STRONG_PASSWORD_MESSAGE);
                }
                updateData.password = await bcrypt.hash(payload.password, 10);
            }

            // Update Name derived field
            if (updateData.firstName || updateData.lastName) {
                const first = updateData.firstName || userExists.firstName;
                const last = updateData.lastName || userExists.lastName;
                updateData.name = `${first} ${last}`;
            }

            console.log(`[ApproveRequest] Applying User Update:`, updateData);

            if (Object.keys(updateData).length > 0) {
                try {
                    await tx.user.update({
                        where: { id: request.requesterId },
                        data: updateData
                    });
                } catch (err: any) {
                    console.error('[ApproveRequest] User Update Failed:', err);
                    throw new Error(`Failed to update user record: ${err.message}`);
                }
            }

            // Audit Log
            if (auditContext) {
                auditService.logAction({
                    adminId: auditContext.adminId,
                    action: AuditActionType.APPROVE,
                    entity: 'Request',
                    targetId: id,
                    details: `Approved User Update Request`,
                    snapshot: { updateData },
                    ipAddress: auditContext.ip,
                    userAgent: auditContext.userAgent
                });
            }

            return tx.changeRequest.update({
                where: { id },
                data: { status: RequestStatus.APPROVED }
            });
        });
    }

    // --- ORGANIZATION EDITS ---
    if (request.type === RequestType.ORG_EDIT || request.type === (RequestType as any).ORG_WEBSITE_UPDATE) {
        let siteIdToIndex: string | null = null;

        const result = await prisma.$transaction(async (tx) => {
            if (!request.organizationId) throw new Error('No organization linked');

            // 1. Update Organization
            const updatedOrg = await tx.organization.update({
                where: { id: request.organizationId },
                data: payload,
                include: { country: true, category: true, state: true } // Need relations to validate or pass down? Actually just IDs usually enough for connect, but good to have.
            });

            // 2. Sync with Site Table
            // If the org has a website, ensure it exists in Site table
            if (updatedOrg.website) {
                // Ensure Category ID is present (Site requires it, Org is optional)
                let categoryId = updatedOrg.categoryId;
                if (!categoryId) {
                    const defaultCat = await tx.category.findFirst({ orderBy: { sortOrder: 'asc' } });
                    if (defaultCat) {
                        categoryId = defaultCat.id;
                    } else {
                        // Should not happen if seeded, but strict fail is safer than runtime crash
                        throw new Error('Cannot create Site: No default category found.');
                    }
                }

                // Check for existing site linked to this org
                const existingSite = await tx.site.findFirst({
                    where: { organizationId: updatedOrg.id }
                });

                if (existingSite) {
                    // Update existing site
                    const site = await tx.site.update({
                        where: { id: existingSite.id },
                        data: {
                            name: updatedOrg.name, // Keep name synced? Usually yes.
                            url: updatedOrg.website,
                            countryId: updatedOrg.countryId,
                            stateId: updatedOrg.stateId ?? undefined,
                            categoryId: categoryId,
                            status: 'SUCCESS' // Re-verify/Approve since Admin approved the change
                        }
                    });
                    siteIdToIndex = site.id;
                } else {
                    // Create new site
                    // We need to ensure uniqueness of URL if possible, or handle error?
                    // site.service handles uniqueness, but here we are in a tx.
                    // We should try to create. 
                    const site = await tx.site.create({
                        data: {
                            name: updatedOrg.name,
                            url: updatedOrg.website,
                            organizationId: updatedOrg.id,
                            countryId: updatedOrg.countryId,
                            stateId: updatedOrg.stateId ?? undefined,
                            categoryId: categoryId,
                            status: 'SUCCESS',
                            // source: 'ORGANIZATION' // REMOVED: source field does not exist in schema. Implicit via organizationId.
                        }
                    });
                    siteIdToIndex = site.id;
                }
            }

            return tx.changeRequest.update({
                where: { id },
                data: { status: RequestStatus.APPROVED }
            });
        });

        // 3. Post-Transaction Indexing
        if (siteIdToIndex) {
            try {
                const fullSite = await prisma.site.findUnique({
                    where: { id: siteIdToIndex },
                    include: { country: true, category: true, state: true, organization: true }
                });
                if (fullSite) {
                    await indexSite(fullSite);
                }
            } catch (e) {
                console.error('[ApproveRequest] Failed to index site after org approval:', e);
                // Non-blocking error
            }
        }

        if (auditContext) {
            auditService.logAction({
                adminId: auditContext.adminId,
                action: AuditActionType.APPROVE,
                entity: 'Request',
                targetId: id,
                details: `Approved Organization Update Request`,
                snapshot: { payload },
                ipAddress: auditContext.ip,
                userAgent: auditContext.userAgent
            });
        }

        return result;
    }

    // --- SITE ADD (WEBSITE RECOMMENDATION) ---
    if (request.type === RequestType.SITE_ADD) {
        return prisma.$transaction(async (tx) => {
            const existing = await tx.site.findUnique({ where: { url: payload.url } });
            if (existing) throw new Error('Site already exists');

            // Robust Category fallback check
            let categoryId = payload.categoryId;
            if (!categoryId) {
                // Fallback: Use the first available category or 'Uncategorized' if possible
                const defaultCat = await tx.category.findFirst({ orderBy: { sortOrder: 'asc' } });
                if (defaultCat) {
                    categoryId = defaultCat.id;
                    console.warn(`[ApproveRequest] Missing Category ID for ${payload.url}. Fallback to ${defaultCat.name} (${categoryId})`);
                } else {
                    throw new Error('Category ID is missing and no default category found.');
                }
            }

            try {
                await tx.site.create({
                    data: {
                        name: payload.name,
                        url: payload.url,
                        countryId: payload.countryId,
                        stateId: payload.stateId || null,
                        categoryId: categoryId,
                        status: 'SUCCESS',
                    },
                });
            } catch (err: any) {
                console.error('[ApproveRequest] Site Create Failed:', err);
                throw new Error(`Failed to create site: ${err.message}`);
            }

            // Audit Log
            if (auditContext) {
                auditService.logAction({
                    adminId: auditContext.adminId,
                    action: AuditActionType.APPROVE,
                    entity: 'Request',
                    targetId: id,
                    details: `Approved Site Add Request: ${payload.url}`,
                    snapshot: { payload },
                    ipAddress: auditContext.ip,
                    userAgent: auditContext.userAgent
                });
            }

            return tx.changeRequest.update({
                where: { id },
                data: { status: RequestStatus.APPROVED }
            });
        });
    }

    throw new Error('Unknown request type');
};

export const approveRequestsBulk = async (
    ids: string[],
    adminId: string,
    auditContext?: { adminId: string; ip?: string; userAgent?: string }
) => {
    let processed = 0;
    let approved = 0;
    let failed = 0;
    const errors: any[] = [];

    for (const id of ids) {
        try {
            // Reuse existing logic
            await approveRequest(id, auditContext);
            approved++;
        } catch (error: any) {
            failed++;
            errors.push({ id, error: error.message });
        }
        processed++;
    }

    return { processed, approved, rejected: 0, failed, errors };
};

export const rejectRequestsBulk = async (
    ids: string[],
    adminId: string,
    note?: string,
    auditContext?: { adminId: string; ip?: string; userAgent?: string }
) => {
    let processed = 0;
    let rejected = 0;
    let failed = 0;
    const errors: any[] = [];

    for (const id of ids) {
        try {
            await rejectRequest(id, note, auditContext);
            rejected++;
        } catch (error: any) {
            failed++;
            errors.push({ id, error: error.message });
        }
        processed++;
    }

    return { processed, approved: 0, rejected, failed, errors };
};
