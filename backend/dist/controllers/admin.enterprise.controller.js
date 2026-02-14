"use strict";
/**
 * Admin Enterprise Controller
 *
 * Super Admin endpoints for managing enterprise workspaces, API keys, and usage logs.
 * All handlers require authenticateAdmin + authorizeRole(['SUPER_ADMIN']).
 */
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
exports.createWorkspaceApiKeyAdmin = exports.updateWorkspaceApiKeyRateLimitAdmin = exports.updateWorkspaceRateLimits = exports.getGlobalUsageLogsAdmin = exports.getWorkspaceUsageLogsAdmin = exports.rotateWorkspaceApiKeyAdmin = exports.revokeWorkspaceApiKey = exports.listWorkspaceApiKeys = exports.getWorkspaceDetails = exports.deleteEnterpriseWorkspaceAdmin = exports.updateEnterpriseWorkspaceAdmin = exports.createEnterpriseWorkspaceAdmin = exports.listEnterpriseWorkspaces = exports.getEnterpriseUsageAdmin = exports.updateEnterpriseRateLimitsAdmin = exports.createEnterpriseApiKeyAdmin = exports.addEnterpriseWorkspaceMemberAdmin = exports.getEnterpriseWorkspaceDetailAdmin = exports.createEnterpriseWorkspaceForOrganizationAdmin = exports.listEnterpriseWorkspacesAdmin = exports.getEnterpriseDetailAdmin = exports.setEnterpriseAccessStatusAdmin = exports.listEnterprisesAdmin = void 0;
const client_1 = require("../db/client");
const apikey_service_1 = require("../services/apikey.service");
const client_2 = require("@prisma/client");
const auditService = __importStar(require("../services/audit.service"));
const enterprise_entitlement_1 = require("../services/enterprise.entitlement");
const getAdminContext = (req) => {
    const admin = req.user;
    if (!admin?.id)
        return null;
    return {
        adminId: admin.id,
        actorRole: admin.role
    };
};
const logAdminEnterpriseAction = async (req, action, entity, details, targetId, snapshot) => {
    const context = getAdminContext(req);
    if (!context)
        return;
    await auditService.logAction({
        adminId: context.adminId,
        actorRole: context.actorRole,
        action,
        entity,
        details,
        targetId,
        snapshot,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
    });
};
const ENTERPRISE_DEFAULT_RATE_LIMIT_RPM = 100;
const MIN_API_RATE_LIMIT_RPM = 1;
const MAX_API_RATE_LIMIT_RPM = 1000000;
const ALLOWED_WORKSPACE_MEMBER_ROLES = [
    client_2.WorkspaceMemberRole.ADMIN,
    client_2.WorkspaceMemberRole.EDITOR,
    client_2.WorkspaceMemberRole.ANALYST,
    client_2.WorkspaceMemberRole.VIEWER
];
const toCountNumber = (value) => {
    if (typeof value === 'number')
        return value;
    if (typeof value === 'bigint')
        return Number(value);
    if (typeof value === 'string') {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
};
const resolveEnterpriseAccessStatus = (organization) => {
    if (organization.isRestricted)
        return 'SUSPENDED';
    if (organization.planStatus !== client_2.PlanStatus.ACTIVE)
        return 'SUSPENDED';
    return 'ACTIVE';
};
const resolvePageParams = (req, defaults = {}) => {
    const pageDefault = defaults.page ?? 1;
    const limitDefault = defaults.limit ?? 20;
    const pageStr = typeof req.query.page === 'string' ? req.query.page : String(pageDefault);
    const limitStr = typeof req.query.limit === 'string' ? req.query.limit : String(limitDefault);
    const page = Math.max(1, parseInt(pageStr, 10) || pageDefault);
    const limit = Math.min(100, Math.max(1, parseInt(limitStr, 10) || limitDefault));
    return {
        page,
        limit,
        skip: (page - 1) * limit
    };
};
const resolveEnterpriseDefaultRpm = (values) => {
    const rates = values.filter((value) => typeof value === 'number'
        && Number.isFinite(value)
        && value >= MIN_API_RATE_LIMIT_RPM
        && value <= MAX_API_RATE_LIMIT_RPM);
    if (rates.length === 0)
        return ENTERPRISE_DEFAULT_RATE_LIMIT_RPM;
    const frequency = new Map();
    for (const rate of rates) {
        frequency.set(rate, (frequency.get(rate) || 0) + 1);
    }
    let selectedRate = ENTERPRISE_DEFAULT_RATE_LIMIT_RPM;
    let selectedCount = -1;
    for (const [rate, count] of frequency.entries()) {
        if (count > selectedCount || (count === selectedCount && rate < selectedRate)) {
            selectedRate = rate;
            selectedCount = count;
        }
    }
    return selectedRate;
};
const isValidRateLimitOverride = (value) => {
    if (value === null || value === undefined)
        return true;
    return Number.isInteger(value) && value >= MIN_API_RATE_LIMIT_RPM && value <= MAX_API_RATE_LIMIT_RPM;
};
const getWorkspaceIdsByEnterprise = async (organizationIds) => {
    const map = new Map();
    if (organizationIds.length === 0)
        return map;
    const links = await client_1.prisma.workspaceOrganization.findMany({
        where: { organizationId: { in: organizationIds } },
        select: { organizationId: true, workspaceId: true }
    });
    for (const link of links) {
        const current = map.get(link.organizationId) || [];
        if (!current.includes(link.workspaceId)) {
            current.push(link.workspaceId);
        }
        map.set(link.organizationId, current);
    }
    return map;
};
const getWorkspaceUsageCounts = async (workspaceIds) => {
    const counts = new Map();
    if (workspaceIds.length === 0)
        return counts;
    const since7 = new Date();
    since7.setDate(since7.getDate() - 7);
    const since30 = new Date();
    since30.setDate(since30.getDate() - 30);
    const rows = await client_1.prisma.$queryRaw `
        SELECT
            k."workspaceId" AS "workspaceId",
            SUM(CASE WHEN l."createdAt" >= ${since7} THEN 1 ELSE 0 END) AS "requests7d",
            COUNT(*) AS "requests30d"
        FROM "ApiUsageLog" l
        INNER JOIN "ApiKey" k ON l."apiKeyId" = k."id"
        WHERE
            k."workspaceId" IN (${client_2.Prisma.join(workspaceIds)})
            AND l."createdAt" >= ${since30}
        GROUP BY k."workspaceId"
    `;
    for (const row of rows) {
        counts.set(row.workspaceId, {
            requests7d: toCountNumber(row.requests7d),
            requests30d: toCountNumber(row.requests30d)
        });
    }
    return counts;
};
const requireEnterpriseOrganization = async (orgId) => {
    const enterprise = await client_1.prisma.organization.findFirst({
        where: {
            id: orgId,
            planType: client_2.PlanType.ENTERPRISE,
            deletedAt: null
        },
        select: {
            id: true,
            name: true,
            slug: true,
            website: true,
            email: true,
            status: true,
            planType: true,
            planStatus: true,
            isRestricted: true,
            updatedAt: true,
            country: {
                select: {
                    id: true,
                    code: true,
                    name: true
                }
            },
            state: {
                select: {
                    id: true,
                    code: true,
                    name: true
                }
            }
        }
    });
    return enterprise;
};
// ============================================
// Enterprise-First Admin Endpoints
// ============================================
const listEnterprisesAdmin = async (req, res) => {
    try {
        const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
        const { page, limit, skip } = resolvePageParams(req, { page: 1, limit: 15 });
        const where = {
            planType: client_2.PlanType.ENTERPRISE,
            deletedAt: null,
            ...(search
                ? {
                    OR: [
                        { name: { contains: search, mode: 'insensitive' } },
                        { slug: { contains: search, mode: 'insensitive' } },
                        { website: { contains: search, mode: 'insensitive' } },
                        { email: { contains: search, mode: 'insensitive' } }
                    ]
                }
                : {})
        };
        const [enterprises, total] = await Promise.all([
            client_1.prisma.organization.findMany({
                where,
                select: {
                    id: true,
                    name: true,
                    slug: true,
                    website: true,
                    email: true,
                    planStatus: true,
                    isRestricted: true,
                    updatedAt: true,
                    country: {
                        select: { code: true, name: true }
                    },
                    state: {
                        select: { code: true, name: true }
                    }
                },
                orderBy: { updatedAt: 'desc' },
                skip,
                take: limit
            }),
            client_1.prisma.organization.count({ where })
        ]);
        const orgIds = enterprises.map((org) => org.id);
        const workspaceMap = await getWorkspaceIdsByEnterprise(orgIds);
        const allWorkspaceIds = [...new Set(Array.from(workspaceMap.values()).flat())];
        const [workspaceRows, apiKeys, usageByWorkspace, keyOverrideRows] = await Promise.all([
            allWorkspaceIds.length > 0
                ? client_1.prisma.workspace.findMany({
                    where: { id: { in: allWorkspaceIds } },
                    select: {
                        id: true,
                        customApiRateLimitRpm: true
                    }
                })
                : Promise.resolve([]),
            allWorkspaceIds.length > 0
                ? client_1.prisma.apiKey.findMany({
                    where: { workspaceId: { in: allWorkspaceIds } },
                    select: {
                        id: true,
                        workspaceId: true
                    }
                })
                : Promise.resolve([]),
            getWorkspaceUsageCounts(allWorkspaceIds),
            allWorkspaceIds.length > 0
                ? client_1.prisma.$queryRaw `
                    SELECT
                        "workspaceId" AS "workspaceId",
                        COUNT(*) AS "count"
                    FROM "ApiKey"
                    WHERE
                        "workspaceId" IN (${client_2.Prisma.join(allWorkspaceIds)})
                        AND "rateLimitRpm" IS NOT NULL
                    GROUP BY "workspaceId"
                `
                : Promise.resolve([])
        ]);
        const workspaceRateMap = new Map(workspaceRows.map((ws) => [ws.id, ws.customApiRateLimitRpm]));
        const keyCountByWorkspace = new Map();
        const keyOverrideByWorkspace = new Map();
        for (const key of apiKeys) {
            keyCountByWorkspace.set(key.workspaceId, (keyCountByWorkspace.get(key.workspaceId) || 0) + 1);
        }
        for (const row of keyOverrideRows) {
            keyOverrideByWorkspace.set(row.workspaceId, toCountNumber(row.count));
        }
        const rows = enterprises.map((org) => {
            const workspaceIds = workspaceMap.get(org.id) || [];
            const workspaceCount = workspaceIds.length;
            const apiKeyCount = workspaceIds.reduce((sum, workspaceId) => sum + (keyCountByWorkspace.get(workspaceId) || 0), 0);
            const keyOverrideCount = workspaceIds.reduce((sum, workspaceId) => sum + (keyOverrideByWorkspace.get(workspaceId) || 0), 0);
            const workspaceOverrideCount = workspaceIds.reduce((sum, workspaceId) => {
                const override = workspaceRateMap.get(workspaceId);
                return sum + (override !== null && override !== undefined ? 1 : 0);
            }, 0);
            const defaultRpm = resolveEnterpriseDefaultRpm(workspaceIds.map((workspaceId) => workspaceRateMap.get(workspaceId)));
            const requests7d = workspaceIds.reduce((sum, workspaceId) => sum + (usageByWorkspace.get(workspaceId)?.requests7d || 0), 0);
            const requests30d = workspaceIds.reduce((sum, workspaceId) => sum + (usageByWorkspace.get(workspaceId)?.requests30d || 0), 0);
            return {
                id: org.id,
                name: org.name,
                slug: org.slug,
                website: org.website,
                email: org.email,
                country: org.country,
                state: org.state,
                accessStatus: resolveEnterpriseAccessStatus(org),
                workspaceCount,
                apiKeyCount,
                requests7d,
                requests30d,
                rateLimits: {
                    defaultRpm,
                    workspaceOverrides: workspaceOverrideCount,
                    keyOverrides: keyOverrideCount
                },
                updatedAt: org.updatedAt
            };
        });
        res.json({
            enterprises: rows,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        });
    }
    catch (error) {
        console.error('[Admin Enterprise] List enterprises error:', error);
        res.status(500).json({ message: error.message || 'Failed to list enterprise organizations' });
    }
};
exports.listEnterprisesAdmin = listEnterprisesAdmin;
const setEnterpriseAccessStatusAdmin = async (req, res) => {
    try {
        const orgId = req.params.orgId;
        const statusInput = String(req.body?.status || '').toUpperCase();
        if (!['ACTIVE', 'SUSPENDED'].includes(statusInput)) {
            res.status(400).json({ message: 'Status must be ACTIVE or SUSPENDED' });
            return;
        }
        const organization = await requireEnterpriseOrganization(orgId);
        if (!organization) {
            res.status(404).json({ message: 'Enterprise organization not found' });
            return;
        }
        const updated = await client_1.prisma.organization.update({
            where: { id: orgId },
            data: { isRestricted: statusInput === 'SUSPENDED' },
            select: {
                id: true,
                name: true,
                isRestricted: true,
                planStatus: true,
                updatedAt: true
            }
        });
        await logAdminEnterpriseAction(req, client_2.AuditActionType.UPDATE, 'Organization', `${statusInput === 'SUSPENDED' ? 'Suspended' : 'Activated'} enterprise access`, orgId, {
            previousStatus: resolveEnterpriseAccessStatus(organization),
            nextStatus: resolveEnterpriseAccessStatus(updated)
        });
        res.json({
            enterprise: {
                id: updated.id,
                name: updated.name,
                accessStatus: resolveEnterpriseAccessStatus(updated),
                updatedAt: updated.updatedAt
            }
        });
    }
    catch (error) {
        console.error('[Admin Enterprise] Set enterprise access status error:', error);
        res.status(500).json({ message: error.message || 'Failed to update enterprise status' });
    }
};
exports.setEnterpriseAccessStatusAdmin = setEnterpriseAccessStatusAdmin;
const getEnterpriseDetailAdmin = async (req, res) => {
    try {
        const orgId = req.params.orgId;
        const enterprise = await requireEnterpriseOrganization(orgId);
        if (!enterprise) {
            res.status(404).json({ message: 'Enterprise organization not found' });
            return;
        }
        const workspaceLinks = await client_1.prisma.workspaceOrganization.findMany({
            where: { organizationId: orgId },
            select: { workspaceId: true }
        });
        const workspaceIds = [...new Set(workspaceLinks.map((item) => item.workspaceId))];
        const [workspaces, members, apiKeys, usageByWorkspace, recentUsageLogs, complianceEvents, apiKeyRateRows] = await Promise.all([
            workspaceIds.length > 0
                ? client_1.prisma.workspace.findMany({
                    where: { id: { in: workspaceIds } },
                    include: {
                        _count: {
                            select: {
                                members: true,
                                organizations: true,
                                apiKeys: true
                            }
                        }
                    },
                    orderBy: { createdAt: 'desc' }
                })
                : Promise.resolve([]),
            workspaceIds.length > 0
                ? client_1.prisma.workspaceMember.findMany({
                    where: { workspaceId: { in: workspaceIds } },
                    orderBy: { joinedAt: 'desc' }
                })
                : Promise.resolve([]),
            workspaceIds.length > 0
                ? client_1.prisma.apiKey.findMany({
                    where: { workspaceId: { in: workspaceIds } },
                    include: {
                        workspace: {
                            select: {
                                id: true,
                                name: true
                            }
                        }
                    },
                    orderBy: { createdAt: 'desc' }
                })
                : Promise.resolve([]),
            getWorkspaceUsageCounts(workspaceIds),
            workspaceIds.length > 0
                ? client_1.prisma.apiUsageLog.findMany({
                    where: {
                        apiKey: {
                            workspaceId: { in: workspaceIds }
                        }
                    },
                    include: {
                        apiKey: {
                            select: {
                                id: true,
                                name: true,
                                workspaceId: true,
                                workspace: {
                                    select: { name: true }
                                }
                            }
                        }
                    },
                    orderBy: { createdAt: 'desc' },
                    take: 25
                })
                : Promise.resolve([]),
            client_1.prisma.complianceIncident.findMany({
                where: { relatedId: orgId },
                orderBy: { createdAt: 'desc' },
                take: 10
            }),
            workspaceIds.length > 0
                ? client_1.prisma.$queryRaw `
                    SELECT
                        "id",
                        "rateLimitRpm"
                    FROM "ApiKey"
                    WHERE "workspaceId" IN (${client_2.Prisma.join(workspaceIds)})
                `
                : Promise.resolve([])
        ]);
        const ownerIds = [...new Set(workspaces.map((ws) => ws.ownerId))];
        const owners = ownerIds.length > 0
            ? await client_1.prisma.user.findMany({
                where: { id: { in: ownerIds } },
                select: { id: true, name: true, email: true }
            })
            : [];
        const ownerMap = new Map(owners.map((owner) => [owner.id, owner]));
        const memberUserIds = [...new Set(members.map((member) => member.userId))];
        const memberUsers = memberUserIds.length > 0
            ? await client_1.prisma.user.findMany({
                where: { id: { in: memberUserIds } },
                select: { id: true, name: true, email: true, firstName: true, lastName: true }
            })
            : [];
        const memberUserMap = new Map(memberUsers.map((user) => [user.id, user]));
        const apiKeyRateMap = new Map(apiKeyRateRows.map((row) => [row.id, row.rateLimitRpm === null ? null : toCountNumber(row.rateLimitRpm)]));
        const defaultRpm = resolveEnterpriseDefaultRpm(workspaces.map((workspace) => workspace.customApiRateLimitRpm));
        const workspaceOverrides = workspaces.filter((ws) => ws.customApiRateLimitRpm !== null).length;
        const keyOverrides = apiKeys.reduce((count, key) => {
            const rateLimit = apiKeyRateMap.get(key.id);
            return count + (rateLimit !== null && rateLimit !== undefined ? 1 : 0);
        }, 0);
        const totalRequests7d = workspaceIds.reduce((sum, workspaceId) => sum + (usageByWorkspace.get(workspaceId)?.requests7d || 0), 0);
        const totalRequests30d = workspaceIds.reduce((sum, workspaceId) => sum + (usageByWorkspace.get(workspaceId)?.requests30d || 0), 0);
        const uniqueMemberIds = new Set(members.map((member) => member.userId));
        const linkedOrgIds = workspaceIds.length > 0
            ? await client_1.prisma.workspaceOrganization.findMany({
                where: { workspaceId: { in: workspaceIds } },
                select: { organizationId: true }
            })
            : [];
        res.json({
            enterprise: {
                id: enterprise.id,
                name: enterprise.name,
                slug: enterprise.slug,
                website: enterprise.website,
                email: enterprise.email,
                status: enterprise.status,
                planStatus: enterprise.planStatus,
                accessStatus: resolveEnterpriseAccessStatus(enterprise),
                country: enterprise.country,
                state: enterprise.state,
                updatedAt: enterprise.updatedAt
            },
            stats: {
                workspaceCount: workspaceIds.length,
                apiKeyCount: apiKeys.length,
                memberCount: uniqueMemberIds.size,
                linkedOrganizationCount: new Set(linkedOrgIds.map((item) => item.organizationId)).size,
                requests7d: totalRequests7d,
                requests30d: totalRequests30d
            },
            rateLimits: {
                defaultRpm,
                workspaceOverrides,
                keyOverrides
            },
            workspaces: workspaces.map((workspace) => ({
                id: workspace.id,
                name: workspace.name,
                status: workspace.status,
                createdAt: workspace.createdAt,
                customApiRateLimitRpm: workspace.customApiRateLimitRpm,
                owner: ownerMap.get(workspace.ownerId) || { id: workspace.ownerId, name: 'Unknown', email: '' },
                memberCount: workspace._count.members,
                apiKeyCount: workspace._count.apiKeys,
                orgCount: workspace._count.organizations
            })),
            members: members.map((member) => {
                const workspace = workspaces.find((item) => item.id === member.workspaceId);
                return {
                    id: member.id,
                    workspaceId: member.workspaceId,
                    workspaceName: workspace?.name || member.workspaceId,
                    userId: member.userId,
                    role: member.role,
                    joinedAt: member.joinedAt,
                    user: memberUserMap.get(member.userId) || null
                };
            }),
            apiKeys: apiKeys.map((key) => ({
                id: key.id,
                name: key.name,
                prefix: key.prefix,
                scopes: key.scopes,
                workspaceId: key.workspaceId,
                workspaceName: key.workspace?.name || key.workspaceId,
                rateLimitRpm: apiKeyRateMap.get(key.id) ?? null,
                isRevoked: key.revokedAt !== null,
                createdAt: key.createdAt,
                lastUsedAt: key.lastUsedAt,
                expiresAt: key.expiresAt
            })),
            recentUsage: recentUsageLogs.map((log) => ({
                id: log.id,
                workspaceId: log.apiKey.workspaceId,
                workspaceName: log.apiKey.workspace.name,
                apiKeyId: log.apiKey.id,
                apiKeyName: log.apiKey.name,
                endpoint: log.endpoint,
                method: log.method,
                statusCode: log.statusCode,
                createdAt: log.createdAt
            })),
            complianceEvents: complianceEvents.map((event) => ({
                id: event.id,
                type: event.type,
                severity: event.severity,
                status: event.status,
                relatedEntity: event.relatedEntity,
                relatedId: event.relatedId,
                createdAt: event.createdAt,
                updatedAt: event.updatedAt
            }))
        });
    }
    catch (error) {
        console.error('[Admin Enterprise] Get enterprise detail error:', error);
        res.status(500).json({ message: error.message || 'Failed to get enterprise details' });
    }
};
exports.getEnterpriseDetailAdmin = getEnterpriseDetailAdmin;
const listEnterpriseWorkspacesAdmin = async (req, res) => {
    try {
        const orgId = req.params.orgId;
        const enterprise = await requireEnterpriseOrganization(orgId);
        if (!enterprise) {
            res.status(404).json({ message: 'Enterprise organization not found' });
            return;
        }
        const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
        const { page, limit, skip } = resolvePageParams(req, { page: 1, limit: 15 });
        const links = await client_1.prisma.workspaceOrganization.findMany({
            where: { organizationId: orgId },
            select: { workspaceId: true }
        });
        const workspaceIds = [...new Set(links.map((link) => link.workspaceId))];
        if (workspaceIds.length === 0) {
            res.json({
                enterprise: { id: enterprise.id, name: enterprise.name },
                workspaces: [],
                pagination: { page, limit, total: 0, totalPages: 0 }
            });
            return;
        }
        const where = {
            id: { in: workspaceIds },
            ...(search ? { name: { contains: search, mode: 'insensitive' } } : {})
        };
        const [workspaces, total] = await Promise.all([
            client_1.prisma.workspace.findMany({
                where,
                include: {
                    _count: {
                        select: {
                            members: true,
                            organizations: true,
                            apiKeys: true
                        }
                    }
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit
            }),
            client_1.prisma.workspace.count({ where })
        ]);
        const ownerIds = [...new Set(workspaces.map((ws) => ws.ownerId))];
        const owners = ownerIds.length > 0
            ? await client_1.prisma.user.findMany({
                where: { id: { in: ownerIds } },
                select: { id: true, name: true, email: true }
            })
            : [];
        const ownerMap = new Map(owners.map((owner) => [owner.id, owner]));
        res.json({
            enterprise: { id: enterprise.id, name: enterprise.name },
            workspaces: workspaces.map((workspace) => ({
                id: workspace.id,
                name: workspace.name,
                status: workspace.status,
                createdAt: workspace.createdAt,
                customApiRateLimitRpm: workspace.customApiRateLimitRpm,
                owner: ownerMap.get(workspace.ownerId) || { id: workspace.ownerId, name: 'Unknown', email: '' },
                memberCount: workspace._count.members,
                apiKeyCount: workspace._count.apiKeys,
                orgCount: workspace._count.organizations
            })),
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        });
    }
    catch (error) {
        console.error('[Admin Enterprise] List enterprise workspaces error:', error);
        res.status(500).json({ message: error.message || 'Failed to list enterprise workspaces' });
    }
};
exports.listEnterpriseWorkspacesAdmin = listEnterpriseWorkspacesAdmin;
const createEnterpriseWorkspaceForOrganizationAdmin = async (req, res) => {
    try {
        const orgId = req.params.orgId;
        const enterprise = await requireEnterpriseOrganization(orgId);
        if (!enterprise) {
            res.status(404).json({ message: 'Enterprise organization not found' });
            return;
        }
        const { name, ownerId, ownerEmail, status } = req.body;
        if (!name || typeof name !== 'string' || name.trim().length < 2) {
            res.status(400).json({ message: 'Workspace name must be at least 2 characters' });
            return;
        }
        let owner = null;
        if (ownerId && typeof ownerId === 'string') {
            owner = await client_1.prisma.user.findUnique({
                where: { id: ownerId },
                select: { id: true, name: true, email: true }
            });
        }
        else if (ownerEmail && typeof ownerEmail === 'string') {
            owner = await client_1.prisma.user.findFirst({
                where: { email: ownerEmail.trim().toLowerCase() },
                select: { id: true, name: true, email: true }
            });
        }
        if (!owner) {
            res.status(400).json({ message: 'Valid ownerId or ownerEmail is required' });
            return;
        }
        const safeStatus = ['ACTIVE', 'SUSPENDED', 'ARCHIVED'].includes(String(status))
            ? status
            : client_2.WorkspaceStatus.ACTIVE;
        const workspace = await client_1.prisma.$transaction(async (tx) => {
            const created = await tx.workspace.create({
                data: {
                    name: name.trim(),
                    status: safeStatus,
                    ownerId: owner.id,
                    members: {
                        create: {
                            userId: owner.id,
                            role: client_2.WorkspaceMemberRole.OWNER
                        }
                    }
                }
            });
            await tx.workspaceOrganization.create({
                data: {
                    workspaceId: created.id,
                    organizationId: orgId,
                    linkedBy: getAdminContext(req)?.adminId
                }
            });
            return created;
        });
        await logAdminEnterpriseAction(req, client_2.AuditActionType.CREATE, 'Workspace', `Created workspace "${workspace.name}" for enterprise "${enterprise.name}"`, workspace.id, { organizationId: orgId, ownerId: owner.id });
        res.status(201).json({
            workspace: {
                id: workspace.id,
                name: workspace.name,
                status: workspace.status,
                createdAt: workspace.createdAt,
                owner
            }
        });
    }
    catch (error) {
        console.error('[Admin Enterprise] Create enterprise workspace error:', error);
        res.status(400).json({ message: error.message || 'Failed to create workspace for enterprise' });
    }
};
exports.createEnterpriseWorkspaceForOrganizationAdmin = createEnterpriseWorkspaceForOrganizationAdmin;
const getEnterpriseWorkspaceDetailAdmin = async (req, res) => {
    try {
        const orgId = req.params.orgId;
        const workspaceId = req.params.workspaceId;
        const enterprise = await requireEnterpriseOrganization(orgId);
        if (!enterprise) {
            res.status(404).json({ message: 'Enterprise organization not found' });
            return;
        }
        const link = await client_1.prisma.workspaceOrganization.findUnique({
            where: {
                workspaceId_organizationId: {
                    workspaceId,
                    organizationId: orgId
                }
            }
        });
        if (!link) {
            res.status(404).json({ message: 'Workspace is not linked to this enterprise' });
            return;
        }
        const limit = typeof req.query.limit === 'string' ? Math.max(1, parseInt(req.query.limit, 10) || 50) : 50;
        const offset = typeof req.query.offset === 'string' ? Math.max(0, parseInt(req.query.offset, 10) || 0) : 0;
        const workspace = await client_1.prisma.workspace.findUnique({
            where: { id: workspaceId },
            include: {
                members: {
                    orderBy: { joinedAt: 'asc' }
                },
                organizations: true,
                _count: {
                    select: { apiKeys: true }
                }
            }
        });
        if (!workspace) {
            res.status(404).json({ message: 'Workspace not found' });
            return;
        }
        const [apiKeys, usage] = await Promise.all([
            (0, apikey_service_1.listApiKeys)(workspaceId),
            (0, apikey_service_1.getWorkspaceUsageLogs)(workspaceId, { limit, offset })
        ]);
        const memberUserIds = workspace.members.map((member) => member.userId);
        const userIds = [...new Set([workspace.ownerId, ...memberUserIds])];
        const users = userIds.length > 0
            ? await client_1.prisma.user.findMany({
                where: { id: { in: userIds } },
                select: { id: true, name: true, email: true, firstName: true, lastName: true }
            })
            : [];
        const userMap = new Map(users.map((user) => [user.id, user]));
        const linkedOrgIds = workspace.organizations.map((item) => item.organizationId);
        const organizations = linkedOrgIds.length > 0
            ? await client_1.prisma.organization.findMany({
                where: { id: { in: linkedOrgIds } },
                select: { id: true, name: true, slug: true, planType: true, status: true }
            })
            : [];
        const orgMap = new Map(organizations.map((organization) => [organization.id, organization]));
        res.json({
            enterprise: { id: enterprise.id, name: enterprise.name },
            workspace: {
                id: workspace.id,
                name: workspace.name,
                status: workspace.status,
                createdAt: workspace.createdAt,
                customApiRateLimitRpm: workspace.customApiRateLimitRpm,
                customApiDailyQuota: workspace.customApiDailyQuota,
                owner: userMap.get(workspace.ownerId) || { id: workspace.ownerId, name: 'Unknown', email: '' },
                apiKeyCount: workspace._count.apiKeys
            },
            members: workspace.members.map((member) => ({
                id: member.id,
                userId: member.userId,
                role: member.role,
                joinedAt: member.joinedAt,
                user: userMap.get(member.userId) || null
            })),
            linkedOrgs: workspace.organizations.map((item) => ({
                id: item.id,
                organizationId: item.organizationId,
                linkedAt: item.createdAt,
                organization: orgMap.get(item.organizationId) || null
            })),
            apiKeys,
            usage
        });
    }
    catch (error) {
        console.error('[Admin Enterprise] Get enterprise workspace detail error:', error);
        res.status(500).json({ message: error.message || 'Failed to get workspace details' });
    }
};
exports.getEnterpriseWorkspaceDetailAdmin = getEnterpriseWorkspaceDetailAdmin;
const addEnterpriseWorkspaceMemberAdmin = async (req, res) => {
    try {
        const orgId = req.params.orgId;
        const workspaceId = req.params.workspaceId;
        const { email, role } = req.body;
        const enterprise = await requireEnterpriseOrganization(orgId);
        if (!enterprise) {
            res.status(404).json({ message: 'Enterprise organization not found' });
            return;
        }
        const link = await client_1.prisma.workspaceOrganization.findUnique({
            where: {
                workspaceId_organizationId: {
                    workspaceId,
                    organizationId: orgId
                }
            },
            select: { workspaceId: true, organizationId: true }
        });
        if (!link) {
            res.status(404).json({ message: 'Workspace is not linked to this enterprise' });
            return;
        }
        const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
        if (!normalizedEmail || !normalizedEmail.includes('@')) {
            res.status(400).json({ message: 'Valid email is required' });
            return;
        }
        const roleInput = String(role || '').toUpperCase();
        const safeRole = ALLOWED_WORKSPACE_MEMBER_ROLES.find((item) => item === roleInput);
        if (!safeRole) {
            res.status(400).json({
                message: 'Invalid role. Allowed roles: ADMIN, EDITOR, ANALYST, VIEWER'
            });
            return;
        }
        const workspace = await client_1.prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { id: true, name: true }
        });
        if (!workspace) {
            res.status(404).json({ message: 'Workspace not found' });
            return;
        }
        const user = await client_1.prisma.user.findFirst({
            where: { email: normalizedEmail },
            select: { id: true, name: true, email: true, firstName: true, lastName: true }
        });
        if (!user) {
            res.status(404).json({ message: 'User not found for the provided email' });
            return;
        }
        const existingMember = await client_1.prisma.workspaceMember.findUnique({
            where: {
                workspaceId_userId: {
                    workspaceId,
                    userId: user.id
                }
            },
            select: { id: true }
        });
        if (existingMember) {
            res.status(409).json({ message: 'User is already a workspace member' });
            return;
        }
        const actorAdminId = getAdminContext(req)?.adminId;
        const createdMember = await client_1.prisma.workspaceMember.create({
            data: {
                workspaceId,
                userId: user.id,
                role: safeRole,
                invitedBy: actorAdminId
            },
            select: {
                id: true,
                workspaceId: true,
                userId: true,
                role: true,
                joinedAt: true
            }
        });
        await logAdminEnterpriseAction(req, client_2.AuditActionType.CREATE, 'WorkspaceMember', 'WORKSPACE_MEMBER_ADDED', createdMember.id, {
            actorAdminId,
            organizationId: orgId,
            workspaceId,
            workspaceName: workspace.name,
            targetUserId: user.id,
            targetEmail: user.email,
            role: createdMember.role,
            timestamp: new Date().toISOString()
        });
        res.status(201).json({
            member: {
                ...createdMember,
                user
            }
        });
    }
    catch (error) {
        console.error('[Admin Enterprise] Add workspace member error:', error);
        res.status(500).json({ message: error.message || 'Failed to add workspace member' });
    }
};
exports.addEnterpriseWorkspaceMemberAdmin = addEnterpriseWorkspaceMemberAdmin;
const createEnterpriseApiKeyAdmin = async (req, res) => {
    try {
        const orgId = req.params.orgId;
        const enterprise = await requireEnterpriseOrganization(orgId);
        if (!enterprise) {
            res.status(404).json({ message: 'Enterprise organization not found' });
            return;
        }
        const { workspaceId, name, scopes, expiresAt, rateLimitRpm } = req.body;
        if (!workspaceId || typeof workspaceId !== 'string') {
            res.status(400).json({ message: 'workspaceId is required' });
            return;
        }
        const link = await client_1.prisma.workspaceOrganization.findUnique({
            where: {
                workspaceId_organizationId: {
                    workspaceId,
                    organizationId: orgId
                }
            }
        });
        if (!link) {
            res.status(400).json({ message: 'Workspace is not linked to this enterprise' });
            return;
        }
        if (!name || typeof name !== 'string' || name.trim().length < 2) {
            res.status(400).json({ message: 'API key name must be at least 2 characters' });
            return;
        }
        if (!scopes || !Array.isArray(scopes) || scopes.length === 0) {
            res.status(400).json({
                message: 'At least one scope is required',
                availableScopes: Object.keys(enterprise_entitlement_1.API_SCOPES)
            });
            return;
        }
        const scopeValidation = (0, enterprise_entitlement_1.validateScopes)(scopes);
        if (!scopeValidation.valid) {
            res.status(400).json({
                message: `Invalid scopes: ${scopeValidation.invalidScopes.join(', ')}`,
                availableScopes: Object.keys(enterprise_entitlement_1.API_SCOPES)
            });
            return;
        }
        if (!isValidRateLimitOverride(rateLimitRpm)) {
            res.status(400).json({
                message: `rateLimitRpm must be an integer between ${MIN_API_RATE_LIMIT_RPM} and ${MAX_API_RATE_LIMIT_RPM}, or null`
            });
            return;
        }
        const adminId = getAdminContext(req)?.adminId || 'admin';
        const result = await (0, apikey_service_1.createApiKey)({
            workspaceId,
            name: name.trim(),
            scopes,
            createdById: adminId,
            expiresAt: expiresAt ? new Date(expiresAt) : null,
            rateLimitRpm: rateLimitRpm ?? null,
            skipEnterpriseQuotaCheck: true
        });
        await logAdminEnterpriseAction(req, client_2.AuditActionType.CREATE, 'ApiKey', `Created API key "${result.apiKey.name}" for enterprise "${enterprise.name}"`, result.apiKey.id, { organizationId: orgId, workspaceId, scopes });
        res.status(201).json({
            apiKey: result.apiKey,
            plainTextKey: result.plainTextKey,
            warning: 'Store this key securely. It will not be shown again.'
        });
    }
    catch (error) {
        console.error('[Admin Enterprise] Create enterprise API key error:', error);
        res.status(400).json({ message: error.message || 'Failed to create API key' });
    }
};
exports.createEnterpriseApiKeyAdmin = createEnterpriseApiKeyAdmin;
const updateEnterpriseRateLimitsAdmin = async (req, res) => {
    try {
        const orgId = req.params.orgId;
        const enterprise = await requireEnterpriseOrganization(orgId);
        if (!enterprise) {
            res.status(404).json({ message: 'Enterprise organization not found' });
            return;
        }
        const { defaultApiRateLimitRpm, workspaceOverrides, keyOverrides } = req.body;
        const hasDefault = defaultApiRateLimitRpm !== undefined;
        const hasWorkspaceOverrides = Array.isArray(workspaceOverrides) && workspaceOverrides.length > 0;
        const hasKeyOverrides = Array.isArray(keyOverrides) && keyOverrides.length > 0;
        if (!hasDefault && !hasWorkspaceOverrides && !hasKeyOverrides) {
            res.status(400).json({
                message: 'Provide defaultApiRateLimitRpm and/or workspaceOverrides and/or keyOverrides'
            });
            return;
        }
        if (!isValidRateLimitOverride(defaultApiRateLimitRpm)) {
            res.status(400).json({
                message: `defaultApiRateLimitRpm must be an integer between ${MIN_API_RATE_LIMIT_RPM} and ${MAX_API_RATE_LIMIT_RPM}, or null`
            });
            return;
        }
        const links = await client_1.prisma.workspaceOrganization.findMany({
            where: { organizationId: orgId },
            select: { workspaceId: true }
        });
        const workspaceIds = [...new Set(links.map((item) => item.workspaceId))];
        const workspaceSet = new Set(workspaceIds);
        for (const item of workspaceOverrides || []) {
            if (!workspaceSet.has(item.workspaceId)) {
                res.status(400).json({ message: `Workspace ${item.workspaceId} is not linked to this enterprise` });
                return;
            }
            if (!isValidRateLimitOverride(item.apiRateLimitRpm)) {
                res.status(400).json({
                    message: `workspace override values must be integers between ${MIN_API_RATE_LIMIT_RPM} and ${MAX_API_RATE_LIMIT_RPM}, or null`
                });
                return;
            }
        }
        for (const item of keyOverrides || []) {
            if (!workspaceSet.has(item.workspaceId)) {
                res.status(400).json({ message: `Workspace ${item.workspaceId} is not linked to this enterprise` });
                return;
            }
            if (!isValidRateLimitOverride(item.rateLimitRpm)) {
                res.status(400).json({
                    message: `key override values must be integers between ${MIN_API_RATE_LIMIT_RPM} and ${MAX_API_RATE_LIMIT_RPM}, or null`
                });
                return;
            }
        }
        let defaultAppliedTo = 0;
        let workspaceOverrideCount = 0;
        let keyOverrideCount = 0;
        await client_1.prisma.$transaction(async (tx) => {
            if (hasDefault && workspaceIds.length > 0) {
                const updated = await tx.workspace.updateMany({
                    where: { id: { in: workspaceIds } },
                    data: { customApiRateLimitRpm: defaultApiRateLimitRpm ?? null }
                });
                defaultAppliedTo = updated.count;
            }
            for (const item of workspaceOverrides || []) {
                await tx.workspace.update({
                    where: { id: item.workspaceId },
                    data: { customApiRateLimitRpm: item.apiRateLimitRpm ?? null }
                });
                workspaceOverrideCount += 1;
            }
            for (const item of keyOverrides || []) {
                const key = await tx.apiKey.findUnique({
                    where: { id: item.keyId },
                    select: { id: true, workspaceId: true }
                });
                if (!key || key.workspaceId !== item.workspaceId) {
                    throw new Error(`API key ${item.keyId} does not belong to workspace ${item.workspaceId}`);
                }
                await tx.$executeRaw `
                    UPDATE "ApiKey"
                    SET "rateLimitRpm" = ${item.rateLimitRpm ?? null}
                    WHERE "id" = ${item.keyId}
                `;
                keyOverrideCount += 1;
            }
        });
        await logAdminEnterpriseAction(req, client_2.AuditActionType.UPDATE, 'EnterpriseRateLimit', `Updated enterprise rate limits for "${enterprise.name}"`, orgId, {
            defaultApiRateLimitRpm: defaultApiRateLimitRpm ?? null,
            workspaceOverrides: workspaceOverrideCount,
            keyOverrides: keyOverrideCount
        });
        res.json({
            success: true,
            applied: {
                defaultAppliedToWorkspaces: defaultAppliedTo,
                workspaceOverrides: workspaceOverrideCount,
                keyOverrides: keyOverrideCount
            }
        });
    }
    catch (error) {
        console.error('[Admin Enterprise] Update enterprise rate limits error:', error);
        res.status(500).json({ message: error.message || 'Failed to update enterprise rate limits' });
    }
};
exports.updateEnterpriseRateLimitsAdmin = updateEnterpriseRateLimitsAdmin;
const getEnterpriseUsageAdmin = async (req, res) => {
    try {
        const orgId = req.params.orgId;
        const enterprise = await requireEnterpriseOrganization(orgId);
        if (!enterprise) {
            res.status(404).json({ message: 'Enterprise organization not found' });
            return;
        }
        const rangeRaw = String(req.query.range || '30').trim();
        const rangeDays = rangeRaw === '7' ? 7 : 30;
        const limit = typeof req.query.limit === 'string' ? Math.max(1, Math.min(200, parseInt(req.query.limit, 10) || 50)) : 50;
        const offset = typeof req.query.offset === 'string' ? Math.max(0, parseInt(req.query.offset, 10) || 0) : 0;
        const links = await client_1.prisma.workspaceOrganization.findMany({
            where: { organizationId: orgId },
            select: { workspaceId: true }
        });
        const workspaceIds = [...new Set(links.map((item) => item.workspaceId))];
        if (workspaceIds.length === 0) {
            res.json({
                enterprise: { id: enterprise.id, name: enterprise.name },
                rangeDays,
                totals: { requestsInRange: 0, requests7d: 0, requests30d: 0 },
                daily: [],
                byWorkspace: [],
                logs: [],
                pagination: { limit, offset, total: 0 }
            });
            return;
        }
        const since = new Date();
        since.setDate(since.getDate() - rangeDays);
        const sinceStart = new Date(since);
        sinceStart.setHours(0, 0, 0, 0);
        const usageByWorkspace = await getWorkspaceUsageCounts(workspaceIds);
        const totals = {
            requests7d: workspaceIds.reduce((sum, workspaceId) => sum + (usageByWorkspace.get(workspaceId)?.requests7d || 0), 0),
            requests30d: workspaceIds.reduce((sum, workspaceId) => sum + (usageByWorkspace.get(workspaceId)?.requests30d || 0), 0),
            requestsInRange: 0
        };
        const dailyRows = await client_1.prisma.$queryRaw `
            SELECT
                DATE_TRUNC('day', l."createdAt") AS "day",
                COUNT(*) AS "count"
            FROM "ApiUsageLog" l
            INNER JOIN "ApiKey" k ON l."apiKeyId" = k."id"
            WHERE
                k."workspaceId" IN (${client_2.Prisma.join(workspaceIds)})
                AND l."createdAt" >= ${sinceStart}
            GROUP BY "day"
            ORDER BY "day" ASC
        `;
        const byWorkspaceRows = await client_1.prisma.$queryRaw `
            SELECT
                k."workspaceId" AS "workspaceId",
                w."name" AS "workspaceName",
                COUNT(*) AS "count"
            FROM "ApiUsageLog" l
            INNER JOIN "ApiKey" k ON l."apiKeyId" = k."id"
            INNER JOIN "Workspace" w ON k."workspaceId" = w."id"
            WHERE
                k."workspaceId" IN (${client_2.Prisma.join(workspaceIds)})
                AND l."createdAt" >= ${sinceStart}
            GROUP BY k."workspaceId", w."name"
            ORDER BY COUNT(*) DESC
        `;
        const [logs, totalLogs] = await Promise.all([
            client_1.prisma.apiUsageLog.findMany({
                where: {
                    apiKey: {
                        workspaceId: { in: workspaceIds }
                    },
                    createdAt: { gte: sinceStart }
                },
                include: {
                    apiKey: {
                        select: {
                            id: true,
                            name: true,
                            workspaceId: true,
                            workspace: {
                                select: { name: true }
                            }
                        }
                    }
                },
                orderBy: { createdAt: 'desc' },
                skip: offset,
                take: limit
            }),
            client_1.prisma.apiUsageLog.count({
                where: {
                    apiKey: {
                        workspaceId: { in: workspaceIds }
                    },
                    createdAt: { gte: sinceStart }
                }
            })
        ]);
        totals.requestsInRange = dailyRows.reduce((sum, row) => sum + toCountNumber(row.count), 0);
        res.json({
            enterprise: { id: enterprise.id, name: enterprise.name },
            rangeDays,
            totals,
            daily: dailyRows.map((row) => ({
                date: row.day.toISOString().split('T')[0],
                count: toCountNumber(row.count)
            })),
            byWorkspace: byWorkspaceRows.map((row) => ({
                workspaceId: row.workspaceId,
                workspaceName: row.workspaceName,
                count: toCountNumber(row.count)
            })),
            logs: logs.map((log) => ({
                id: log.id,
                workspaceId: log.apiKey.workspaceId,
                workspaceName: log.apiKey.workspace.name,
                apiKeyId: log.apiKey.id,
                apiKeyName: log.apiKey.name,
                endpoint: log.endpoint,
                method: log.method,
                statusCode: log.statusCode,
                createdAt: log.createdAt
            })),
            pagination: {
                limit,
                offset,
                total: totalLogs
            }
        });
    }
    catch (error) {
        console.error('[Admin Enterprise] Get enterprise usage error:', error);
        res.status(500).json({ message: error.message || 'Failed to load enterprise usage' });
    }
};
exports.getEnterpriseUsageAdmin = getEnterpriseUsageAdmin;
// ============================================
// List Enterprise Workspaces
// ============================================
const listEnterpriseWorkspaces = async (req, res) => {
    try {
        const search = typeof req.query.search === 'string' ? req.query.search : undefined;
        const pageStr = typeof req.query.page === 'string' ? req.query.page : '1';
        const limitStr = typeof req.query.limit === 'string' ? req.query.limit : '20';
        const pageNum = Math.max(1, parseInt(pageStr, 10) || 1);
        const limitNum = Math.min(50, Math.max(1, parseInt(limitStr, 10) || 20));
        const skip = (pageNum - 1) * limitNum;
        const where = {};
        if (search && search.trim()) {
            where.name = { contains: search.trim(), mode: 'insensitive' };
        }
        const [workspaces, total] = await Promise.all([
            client_1.prisma.workspace.findMany({
                where,
                include: {
                    _count: {
                        select: {
                            members: true,
                            apiKeys: true,
                            organizations: true
                        }
                    }
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limitNum
            }),
            client_1.prisma.workspace.count({ where })
        ]);
        // Fetch owner names in one go
        const ownerIds = [...new Set(workspaces.map(w => w.ownerId))];
        const owners = await client_1.prisma.user.findMany({
            where: { id: { in: ownerIds } },
            select: { id: true, name: true, email: true }
        });
        const ownerMap = new Map(owners.map(o => [o.id, o]));
        res.json({
            workspaces: workspaces.map(w => ({
                id: w.id,
                name: w.name,
                status: w.status,
                createdAt: w.createdAt,
                owner: ownerMap.get(w.ownerId) || { id: w.ownerId, name: 'Unknown', email: '' },
                memberCount: w._count.members,
                apiKeyCount: w._count.apiKeys,
                orgCount: w._count.organizations
            })),
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                totalPages: Math.ceil(total / limitNum)
            }
        });
    }
    catch (error) {
        console.error('[Admin Enterprise] List workspaces error:', error);
        res.status(500).json({ message: error.message || 'Failed to list workspaces' });
    }
};
exports.listEnterpriseWorkspaces = listEnterpriseWorkspaces;
// ============================================
// Workspace CRUD (Super Admin)
// ============================================
const createEnterpriseWorkspaceAdmin = async (req, res) => {
    try {
        const { name, ownerId, ownerEmail, status } = req.body;
        if (!name || typeof name !== 'string' || name.trim().length < 2) {
            res.status(400).json({ message: 'Workspace name must be at least 2 characters' });
            return;
        }
        let owner = null;
        if (ownerId && typeof ownerId === 'string') {
            owner = await client_1.prisma.user.findUnique({ where: { id: ownerId }, select: { id: true } });
        }
        else if (ownerEmail && typeof ownerEmail === 'string') {
            owner = await client_1.prisma.user.findFirst({
                where: { email: ownerEmail.trim().toLowerCase() },
                select: { id: true }
            });
        }
        if (!owner) {
            res.status(400).json({ message: 'Valid ownerId or ownerEmail is required' });
            return;
        }
        const safeStatus = ['ACTIVE', 'SUSPENDED', 'ARCHIVED'].includes(String(status))
            ? status
            : client_2.WorkspaceStatus.ACTIVE;
        const workspace = await client_1.prisma.workspace.create({
            data: {
                name: name.trim(),
                status: safeStatus,
                ownerId: owner.id,
                members: {
                    create: {
                        userId: owner.id,
                        role: client_2.WorkspaceMemberRole.OWNER
                    }
                }
            }
        });
        await logAdminEnterpriseAction(req, client_2.AuditActionType.CREATE, 'Workspace', `Created workspace "${workspace.name}"`, workspace.id, { ownerId: owner.id, status: workspace.status });
        res.status(201).json({ workspace });
    }
    catch (error) {
        console.error('[Admin Enterprise] Create workspace error:', error);
        res.status(400).json({ message: error.message || 'Failed to create workspace' });
    }
};
exports.createEnterpriseWorkspaceAdmin = createEnterpriseWorkspaceAdmin;
const updateEnterpriseWorkspaceAdmin = async (req, res) => {
    try {
        const id = req.params.id;
        const { name, status } = req.body;
        const workspace = await client_1.prisma.workspace.findUnique({ where: { id }, select: { id: true, name: true, status: true } });
        if (!workspace) {
            res.status(404).json({ message: 'Workspace not found' });
            return;
        }
        const updateData = {};
        if (typeof name === 'string' && name.trim().length >= 2) {
            updateData.name = name.trim();
        }
        if (status !== undefined) {
            if (!['ACTIVE', 'SUSPENDED', 'ARCHIVED'].includes(String(status))) {
                res.status(400).json({ message: 'Invalid workspace status' });
                return;
            }
            updateData.status = status;
        }
        if (Object.keys(updateData).length === 0) {
            res.status(400).json({ message: 'At least one field (name/status) is required' });
            return;
        }
        const updated = await client_1.prisma.workspace.update({
            where: { id },
            data: updateData
        });
        await logAdminEnterpriseAction(req, client_2.AuditActionType.UPDATE, 'Workspace', `Updated workspace "${workspace.name}"`, id, { before: workspace, after: updated });
        res.json({ workspace: updated });
    }
    catch (error) {
        console.error('[Admin Enterprise] Update workspace error:', error);
        res.status(400).json({ message: error.message || 'Failed to update workspace' });
    }
};
exports.updateEnterpriseWorkspaceAdmin = updateEnterpriseWorkspaceAdmin;
const deleteEnterpriseWorkspaceAdmin = async (req, res) => {
    try {
        const id = req.params.id;
        const workspace = await client_1.prisma.workspace.findUnique({
            where: { id },
            select: { id: true, name: true }
        });
        if (!workspace) {
            res.status(404).json({ message: 'Workspace not found' });
            return;
        }
        await client_1.prisma.$transaction(async (tx) => {
            await tx.workspaceMember.deleteMany({ where: { workspaceId: id } });
            await tx.$executeRaw `DELETE FROM "Invite" WHERE "workspaceId" = ${id}`;
            await tx.workspaceOrganization.deleteMany({ where: { workspaceId: id } });
            await tx.apiUsageLog.deleteMany({
                where: {
                    apiKey: {
                        workspaceId: id
                    }
                }
            });
            await tx.apiKey.deleteMany({ where: { workspaceId: id } });
            await tx.workspace.delete({ where: { id } });
        });
        await logAdminEnterpriseAction(req, client_2.AuditActionType.DELETE, 'Workspace', `Deleted workspace "${workspace.name}"`, id);
        res.json({ success: true });
    }
    catch (error) {
        console.error('[Admin Enterprise] Delete workspace error:', error);
        res.status(400).json({ message: error.message || 'Failed to delete workspace' });
    }
};
exports.deleteEnterpriseWorkspaceAdmin = deleteEnterpriseWorkspaceAdmin;
// ============================================
// Get Workspace Details
// ============================================
const getWorkspaceDetails = async (req, res) => {
    try {
        const id = req.params.id;
        const workspace = await client_1.prisma.workspace.findUnique({
            where: { id },
            include: {
                members: {
                    orderBy: { joinedAt: 'asc' }
                },
                organizations: true,
                _count: {
                    select: { apiKeys: true }
                }
            }
        });
        if (!workspace) {
            res.status(404).json({ message: 'Workspace not found' });
            return;
        }
        // Fetch owner + member user info
        const memberUserIds = workspace.members.map((m) => m.userId);
        const allUserIds = [...new Set([workspace.ownerId, ...memberUserIds])];
        const users = await client_1.prisma.user.findMany({
            where: { id: { in: allUserIds } },
            select: { id: true, name: true, email: true, firstName: true, lastName: true }
        });
        const userMap = new Map(users.map(u => [u.id, u]));
        // Fetch linked org details
        const orgIds = workspace.organizations.map((wo) => wo.organizationId);
        const orgs = orgIds.length > 0 ? await client_1.prisma.organization.findMany({
            where: { id: { in: orgIds } },
            select: { id: true, name: true, slug: true, planType: true, status: true }
        }) : [];
        const orgMap = new Map(orgs.map(o => [o.id, o]));
        res.json({
            workspace: {
                id: workspace.id,
                name: workspace.name,
                status: workspace.status,
                createdAt: workspace.createdAt,
                owner: userMap.get(workspace.ownerId) || { id: workspace.ownerId, name: 'Unknown', email: '' },
                apiKeyCount: workspace._count.apiKeys
            },
            members: workspace.members.map((m) => ({
                id: m.id,
                userId: m.userId,
                role: m.role,
                joinedAt: m.joinedAt,
                user: userMap.get(m.userId) || null
            })),
            linkedOrgs: workspace.organizations.map((lo) => ({
                id: lo.id,
                organizationId: lo.organizationId,
                linkedAt: lo.createdAt,
                organization: orgMap.get(lo.organizationId) || null
            }))
        });
    }
    catch (error) {
        console.error('[Admin Enterprise] Get workspace details error:', error);
        res.status(500).json({ message: error.message || 'Failed to get workspace details' });
    }
};
exports.getWorkspaceDetails = getWorkspaceDetails;
// ============================================
// List Workspace API Keys
// ============================================
const listWorkspaceApiKeys = async (req, res) => {
    try {
        const id = req.params.id;
        const workspace = await client_1.prisma.workspace.findUnique({ where: { id }, select: { id: true } });
        if (!workspace) {
            res.status(404).json({ message: 'Workspace not found' });
            return;
        }
        const apiKeys = await (0, apikey_service_1.listApiKeys)(id);
        res.json({ apiKeys });
    }
    catch (error) {
        console.error('[Admin Enterprise] List API keys error:', error);
        res.status(500).json({ message: error.message || 'Failed to list API keys' });
    }
};
exports.listWorkspaceApiKeys = listWorkspaceApiKeys;
// ============================================
// Revoke API Key (Admin)
// ============================================
const revokeWorkspaceApiKey = async (req, res) => {
    try {
        const id = req.params.id;
        const keyId = req.params.keyId;
        const workspace = await client_1.prisma.workspace.findUnique({ where: { id }, select: { id: true } });
        if (!workspace) {
            res.status(404).json({ message: 'Workspace not found' });
            return;
        }
        const apiKey = await (0, apikey_service_1.getApiKeyById)(keyId);
        if (!apiKey) {
            res.status(404).json({ message: 'API key not found' });
            return;
        }
        if (apiKey.workspaceId !== id) {
            res.status(400).json({ message: 'API key does not belong to this workspace' });
            return;
        }
        await (0, apikey_service_1.revokeApiKey)(keyId);
        await logAdminEnterpriseAction(req, client_2.AuditActionType.UPDATE, 'ApiKey', `Revoked API key "${apiKey.name}"`, keyId, { workspaceId: id });
        res.json({ success: true, message: 'API key revoked' });
    }
    catch (error) {
        console.error('[Admin Enterprise] Revoke API key error:', error);
        res.status(400).json({ message: error.message || 'Failed to revoke API key' });
    }
};
exports.revokeWorkspaceApiKey = revokeWorkspaceApiKey;
const rotateWorkspaceApiKeyAdmin = async (req, res) => {
    try {
        const id = req.params.id;
        const keyId = req.params.keyId;
        const actorId = req.user?.id;
        if (!actorId) {
            res.status(401).json({ message: 'Unauthorized' });
            return;
        }
        const workspace = await client_1.prisma.workspace.findUnique({ where: { id }, select: { id: true } });
        if (!workspace) {
            res.status(404).json({ message: 'Workspace not found' });
            return;
        }
        const apiKey = await (0, apikey_service_1.getApiKeyById)(keyId);
        if (!apiKey) {
            res.status(404).json({ message: 'API key not found' });
            return;
        }
        if (apiKey.workspaceId !== id) {
            res.status(400).json({ message: 'API key does not belong to this workspace' });
            return;
        }
        const result = await (0, apikey_service_1.rotateApiKey)(keyId, actorId);
        await logAdminEnterpriseAction(req, client_2.AuditActionType.UPDATE, 'ApiKey', `Rotated API key "${apiKey.name}"`, keyId, { workspaceId: id });
        res.status(201).json({
            apiKey: result.apiKey,
            plainTextKey: result.plainTextKey,
            warning: 'Store this key securely. It will not be shown again.'
        });
    }
    catch (error) {
        console.error('[Admin Enterprise] Rotate API key error:', error);
        res.status(400).json({ message: error.message || 'Failed to rotate API key' });
    }
};
exports.rotateWorkspaceApiKeyAdmin = rotateWorkspaceApiKeyAdmin;
// ============================================
// Get Workspace Usage Logs
// ============================================
const getWorkspaceUsageLogsAdmin = async (req, res) => {
    try {
        const id = req.params.id;
        const limitVal = typeof req.query.limit === 'string' ? parseInt(req.query.limit, 10) : undefined;
        const offsetVal = typeof req.query.offset === 'string' ? parseInt(req.query.offset, 10) : undefined;
        const apiKeyId = typeof req.query.apiKeyId === 'string' ? req.query.apiKeyId : undefined;
        const workspace = await client_1.prisma.workspace.findUnique({ where: { id }, select: { id: true } });
        if (!workspace) {
            res.status(404).json({ message: 'Workspace not found' });
            return;
        }
        const result = await (0, apikey_service_1.getWorkspaceUsageLogs)(id, {
            limit: limitVal,
            offset: offsetVal,
            apiKeyId
        });
        res.json(result);
    }
    catch (error) {
        console.error('[Admin Enterprise] Get usage logs error:', error);
        res.status(500).json({ message: error.message || 'Failed to get usage logs' });
    }
};
exports.getWorkspaceUsageLogsAdmin = getWorkspaceUsageLogsAdmin;
const getGlobalUsageLogsAdmin = async (req, res) => {
    try {
        const limit = typeof req.query.limit === 'string' ? parseInt(req.query.limit, 10) : undefined;
        const offset = typeof req.query.offset === 'string' ? parseInt(req.query.offset, 10) : undefined;
        const workspaceId = typeof req.query.workspaceId === 'string' ? req.query.workspaceId : undefined;
        const apiKeyId = typeof req.query.apiKeyId === 'string' ? req.query.apiKeyId : undefined;
        const result = await (0, apikey_service_1.getGlobalUsageLogs)({
            limit,
            offset,
            workspaceId,
            apiKeyId
        });
        res.json(result);
    }
    catch (error) {
        console.error('[Admin Enterprise] Global usage logs error:', error);
        res.status(500).json({ message: error.message || 'Failed to get usage logs' });
    }
};
exports.getGlobalUsageLogsAdmin = getGlobalUsageLogsAdmin;
// ============================================
// Update Workspace Rate Limits (Issue B)
// ============================================
const updateWorkspaceRateLimits = async (req, res) => {
    try {
        const id = req.params.id;
        const { apiRateLimitRpm, apiDailyQuota } = req.body;
        const workspace = await client_1.prisma.workspace.findUnique({ where: { id }, select: { id: true } });
        if (!workspace) {
            res.status(404).json({ message: 'Workspace not found' });
            return;
        }
        // Validate inputs — null clears the override (falls back to plan default)
        const updateData = {};
        if (apiRateLimitRpm !== undefined) {
            if (apiRateLimitRpm !== null && (typeof apiRateLimitRpm !== 'number' || apiRateLimitRpm < 0)) {
                res.status(400).json({ message: 'apiRateLimitRpm must be a non-negative number or null' });
                return;
            }
            updateData.customApiRateLimitRpm = apiRateLimitRpm;
        }
        if (apiDailyQuota !== undefined) {
            if (apiDailyQuota !== null && (typeof apiDailyQuota !== 'number' || apiDailyQuota < 0)) {
                res.status(400).json({ message: 'apiDailyQuota must be a non-negative number or null' });
                return;
            }
            updateData.customApiDailyQuota = apiDailyQuota;
        }
        if (Object.keys(updateData).length === 0) {
            res.status(400).json({ message: 'At least one of apiRateLimitRpm or apiDailyQuota is required' });
            return;
        }
        const updated = await client_1.prisma.workspace.update({
            where: { id },
            data: updateData,
            select: {
                id: true,
                name: true,
                customApiRateLimitRpm: true,
                customApiDailyQuota: true
            }
        });
        await logAdminEnterpriseAction(req, client_2.AuditActionType.UPDATE, 'Workspace', `Updated workspace rate limits for "${updated.name}"`, id, updated);
        res.json({
            success: true,
            workspace: updated
        });
    }
    catch (error) {
        console.error('[Admin Enterprise] Update rate limits error:', error);
        res.status(500).json({ message: error.message || 'Failed to update rate limits' });
    }
};
exports.updateWorkspaceRateLimits = updateWorkspaceRateLimits;
const updateWorkspaceApiKeyRateLimitAdmin = async (req, res) => {
    try {
        const workspaceId = req.params.id;
        const keyId = req.params.keyId;
        const { rateLimitRpm } = req.body;
        const workspace = await client_1.prisma.workspace.findUnique({ where: { id: workspaceId }, select: { id: true } });
        if (!workspace) {
            res.status(404).json({ message: 'Workspace not found' });
            return;
        }
        if (rateLimitRpm !== null && rateLimitRpm !== undefined) {
            if (typeof rateLimitRpm !== 'number' || rateLimitRpm < 0) {
                res.status(400).json({ message: 'rateLimitRpm must be a non-negative number or null' });
                return;
            }
        }
        const apiKey = await (0, apikey_service_1.getApiKeyById)(keyId);
        if (!apiKey) {
            res.status(404).json({ message: 'API key not found' });
            return;
        }
        if (apiKey.workspaceId !== workspaceId) {
            res.status(400).json({ message: 'API key does not belong to this workspace' });
            return;
        }
        const updatedKey = await (0, apikey_service_1.updateApiKeyRateLimit)(keyId, rateLimitRpm ?? null);
        await logAdminEnterpriseAction(req, client_2.AuditActionType.UPDATE, 'ApiKey', `Updated API key rate limit for "${updatedKey.name}"`, keyId, { workspaceId, rateLimitRpm: updatedKey.rateLimitRpm });
        res.json({ success: true, apiKey: updatedKey });
    }
    catch (error) {
        console.error('[Admin Enterprise] Update API key rate limit error:', error);
        res.status(500).json({ message: error.message || 'Failed to update API key rate limit' });
    }
};
exports.updateWorkspaceApiKeyRateLimitAdmin = updateWorkspaceApiKeyRateLimitAdmin;
// ============================================
// Create API Key for Workspace (Issue C)
// ============================================
const createWorkspaceApiKeyAdmin = async (req, res) => {
    try {
        const id = req.params.id;
        const { name, scopes, expiresAt, rateLimitRpm } = req.body;
        const workspace = await client_1.prisma.workspace.findUnique({ where: { id }, select: { id: true } });
        if (!workspace) {
            res.status(404).json({ message: 'Workspace not found' });
            return;
        }
        // Validate name
        if (!name || typeof name !== 'string' || name.trim().length < 2) {
            res.status(400).json({ message: 'API key name must be at least 2 characters' });
            return;
        }
        // Validate scopes
        if (!scopes || !Array.isArray(scopes) || scopes.length === 0) {
            res.status(400).json({
                message: 'At least one scope is required',
                availableScopes: Object.keys(enterprise_entitlement_1.API_SCOPES)
            });
            return;
        }
        const scopeValidation = (0, enterprise_entitlement_1.validateScopes)(scopes);
        if (!scopeValidation.valid) {
            res.status(400).json({
                message: `Invalid scopes: ${scopeValidation.invalidScopes.join(', ')}`,
                availableScopes: Object.keys(enterprise_entitlement_1.API_SCOPES)
            });
            return;
        }
        // Use adminId as createdById (from auth middleware)
        const adminId = req.user?.id || 'admin';
        if (rateLimitRpm !== undefined && rateLimitRpm !== null) {
            if (typeof rateLimitRpm !== 'number' || rateLimitRpm < 0) {
                res.status(400).json({ message: 'rateLimitRpm must be a non-negative number or null' });
                return;
            }
        }
        const result = await (0, apikey_service_1.createApiKey)({
            workspaceId: id,
            name: name.trim(),
            scopes,
            createdById: adminId,
            expiresAt: expiresAt ? new Date(expiresAt) : null,
            rateLimitRpm: rateLimitRpm ?? null,
            skipEnterpriseQuotaCheck: true
        });
        await logAdminEnterpriseAction(req, client_2.AuditActionType.CREATE, 'ApiKey', `Created API key "${result.apiKey.name}"`, result.apiKey.id, { workspaceId: id, scopes });
        res.status(201).json({
            apiKey: result.apiKey,
            plainTextKey: result.plainTextKey,
            warning: 'Store this key securely. It will not be shown again.'
        });
    }
    catch (error) {
        console.error('[Admin Enterprise] Create API key error:', error);
        res.status(400).json({ message: error.message || 'Failed to create API key' });
    }
};
exports.createWorkspaceApiKeyAdmin = createWorkspaceApiKeyAdmin;
