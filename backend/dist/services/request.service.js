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
exports.rejectRequestsBulk = exports.approveRequestsBulk = exports.approveRequest = exports.rejectRequest = exports.getRequestById = exports.getRequests = exports.createRequest = exports.getUserRequestUsage = void 0;
const client_1 = require("../db/client");
const client_2 = require("@prisma/client");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const meilisearch_service_1 = require("./meilisearch.service");
const passwordPolicy_1 = require("../utils/passwordPolicy");
// Helper to get start of day in UTC (or consistent server time)
const getStartOfDay = (date) => {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    return start;
};
const getUserRequestUsage = async (userId) => {
    const user = await client_1.prisma.user.findUnique({
        where: { id: userId },
        select: { dailyRequestLimit: true, requestLimit: true, requestLimitWindow: true }
    });
    if (!user)
        return { used: 0, limit: null, window: 1, remaining: null };
    // Determine effective limit and window
    let limit = user.requestLimit;
    let windowDays = user.requestLimitWindow || 1;
    // Fallback to legacy
    if (limit === null && user.dailyRequestLimit !== null) {
        limit = user.dailyRequestLimit;
        windowDays = 1;
    }
    if (limit === null)
        return { used: 0, limit: null, window: windowDays, remaining: null };
    // Calculate window start
    const windowStart = new Date();
    windowStart.setDate(windowStart.getDate() - windowDays);
    // Count
    const used = await client_1.prisma.changeRequest.count({
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
exports.getUserRequestUsage = getUserRequestUsage;
const createRequest = async (data) => {
    // 1. Check Request Limit for User
    const user = await client_1.prisma.user.findUnique({
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
            const requestsInWindow = await client_1.prisma.changeRequest.count({
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
    return client_1.prisma.changeRequest.create({
        data: {
            type: data.type,
            payload: data.payload, // Prisma handles JSON automatically
            requesterId: data.requesterId,
            organizationId: data.organizationId,
            status: client_2.RequestStatus.PENDING,
        },
    });
};
exports.createRequest = createRequest;
const getRequests = async (filters) => {
    return client_1.prisma.changeRequest.findMany({
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
exports.getRequests = getRequests;
const getRequestById = async (id) => {
    return client_1.prisma.changeRequest.findUnique({
        where: { id },
        include: {
            requester: true,
            organization: true,
        },
    });
};
exports.getRequestById = getRequestById;
const auditService = __importStar(require("./audit.service"));
const client_3 = require("@prisma/client");
const rejectRequest = async (id, adminNotes, auditContext) => {
    const result = await client_1.prisma.changeRequest.update({
        where: { id },
        data: {
            status: client_2.RequestStatus.REJECTED,
            adminNotes,
        },
    });
    if (auditContext) {
        auditService.logAction({
            adminId: auditContext.adminId,
            action: client_3.AuditActionType.REJECT,
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
exports.rejectRequest = rejectRequest;
const approveRequest = async (id, auditContext) => {
    const request = await client_1.prisma.changeRequest.findUnique({ where: { id } });
    if (!request)
        throw new Error('Request not found');
    if (request.status !== client_2.RequestStatus.PENDING)
        throw new Error('Request is not pending');
    const payload = request.payload;
    console.log(`[ApproveRequest] Processing ${request.type} for ${id}`, payload);
    // --- USER PROFILE UPDATE ---
    if (request.type === client_2.RequestType.USER_UPDATE) {
        return client_1.prisma.$transaction(async (tx) => {
            const userExists = await tx.user.findUnique({ where: { id: request.requesterId } });
            if (!userExists) {
                console.warn(`[ApproveRequest] User ${request.requesterId} missing. Auto-rejecting.`);
                return tx.changeRequest.update({
                    where: { id },
                    data: { status: client_2.RequestStatus.REJECTED, adminNotes: 'User not found' }
                });
            }
            // Explit Payload Sanitization (Whitelist approach)
            const updateData = {};
            if (payload.firstName && typeof payload.firstName === 'string')
                updateData.firstName = payload.firstName;
            if (payload.lastName && typeof payload.lastName === 'string')
                updateData.lastName = payload.lastName;
            if (payload.country && typeof payload.country === 'string')
                updateData.country = payload.country;
            // Handle Email (Unique Check)
            if (payload.email && typeof payload.email === 'string' && payload.email !== userExists.email) {
                const conflict = await tx.user.findFirst({
                    where: { email: payload.email, NOT: { id: request.requesterId } }
                });
                if (conflict)
                    throw new Error('Email already in use');
                updateData.email = payload.email;
            }
            // Handle Password
            if (payload.password && typeof payload.password === 'string') {
                if (!(0, passwordPolicy_1.isStrongPassword)(payload.password)) {
                    throw new Error(passwordPolicy_1.STRONG_PASSWORD_MESSAGE);
                }
                updateData.password = await bcryptjs_1.default.hash(payload.password, 10);
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
                }
                catch (err) {
                    console.error('[ApproveRequest] User Update Failed:', err);
                    throw new Error(`Failed to update user record: ${err.message}`);
                }
            }
            // Audit Log
            if (auditContext) {
                auditService.logAction({
                    adminId: auditContext.adminId,
                    action: client_3.AuditActionType.APPROVE,
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
                data: { status: client_2.RequestStatus.APPROVED }
            });
        }, {
            timeout: 10000,
            maxWait: 5000
        });
    }
    // --- ORGANIZATION EDITS ---
    if (request.type === client_2.RequestType.ORG_EDIT || request.type === client_2.RequestType.ORG_WEBSITE_UPDATE) {
        let siteIdToIndex = null;
        const result = await client_1.prisma.$transaction(async (tx) => {
            if (!request.organizationId)
                throw new Error('No organization linked');
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
                    }
                    else {
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
                }
                else {
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
                data: { status: client_2.RequestStatus.APPROVED }
            });
        }, {
            timeout: 10000,
            maxWait: 5000
        });
        // 3. Post-Transaction Indexing
        if (siteIdToIndex) {
            try {
                const fullSite = await client_1.prisma.site.findUnique({
                    where: { id: siteIdToIndex },
                    include: { country: true, category: true, state: true, organization: true }
                });
                if (fullSite) {
                    await (0, meilisearch_service_1.indexSite)(fullSite);
                }
            }
            catch (e) {
                console.error('[ApproveRequest] Failed to index site after org approval:', e);
                // Non-blocking error
            }
        }
        if (auditContext) {
            auditService.logAction({
                adminId: auditContext.adminId,
                action: client_3.AuditActionType.APPROVE,
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
    if (request.type === client_2.RequestType.SITE_ADD) {
        return client_1.prisma.$transaction(async (tx) => {
            const existing = await tx.site.findUnique({ where: { url: payload.url } });
            if (existing)
                throw new Error('Site already exists');
            // Robust Category fallback check
            let categoryId = payload.categoryId;
            if (!categoryId) {
                // Fallback: Use the first available category or 'Uncategorized' if possible
                const defaultCat = await tx.category.findFirst({ orderBy: { sortOrder: 'asc' } });
                if (defaultCat) {
                    categoryId = defaultCat.id;
                    console.warn(`[ApproveRequest] Missing Category ID for ${payload.url}. Fallback to ${defaultCat.name} (${categoryId})`);
                }
                else {
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
            }
            catch (err) {
                console.error('[ApproveRequest] Site Create Failed:', err);
                throw new Error(`Failed to create site: ${err.message}`);
            }
            // Audit Log
            if (auditContext) {
                auditService.logAction({
                    adminId: auditContext.adminId,
                    action: client_3.AuditActionType.APPROVE,
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
                data: { status: client_2.RequestStatus.APPROVED }
            });
        }, {
            timeout: 10000,
            maxWait: 5000
        });
    }
    throw new Error('Unknown request type');
};
exports.approveRequest = approveRequest;
const approveRequestsBulk = async (ids, adminId, auditContext) => {
    let processed = 0;
    let approved = 0;
    let failed = 0;
    const errors = [];
    for (const id of ids) {
        try {
            // Reuse existing logic
            await (0, exports.approveRequest)(id, auditContext);
            approved++;
        }
        catch (error) {
            failed++;
            errors.push({ id, error: error.message });
        }
        processed++;
    }
    return { processed, approved, rejected: 0, failed, errors };
};
exports.approveRequestsBulk = approveRequestsBulk;
const rejectRequestsBulk = async (ids, adminId, note, auditContext) => {
    let processed = 0;
    let rejected = 0;
    let failed = 0;
    const errors = [];
    for (const id of ids) {
        try {
            await (0, exports.rejectRequest)(id, note, auditContext);
            rejected++;
        }
        catch (error) {
            failed++;
            errors.push({ id, error: error.message });
        }
        processed++;
    }
    return { processed, approved: 0, rejected, failed, errors };
};
exports.rejectRequestsBulk = rejectRequestsBulk;
