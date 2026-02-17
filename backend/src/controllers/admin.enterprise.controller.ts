/**
 * Admin Enterprise Controller
 * 
 * Super Admin endpoints for managing enterprise workspaces, API keys, and usage logs.
 * All handlers require authenticateAdmin + authorizeRole(['SUPER_ADMIN']).
 */

import { Request, Response } from 'express';
import { prisma } from '../db/client';
import {
    createApiKey,
    listApiKeys,
    revokeApiKey,
    getApiKeyById,
    rotateApiKey,
    updateApiKeyRateLimit,
    getWorkspaceUsageLogs,
    getGlobalUsageLogs
} from '../services/apikey.service';
import {
    AuditActionType,
    PlanStatus,
    PlanType,
    Prisma,
    WorkspaceMemberRole,
    WorkspaceStatus
} from '@prisma/client';
import * as auditService from '../services/audit.service';
import { validateScopes, API_SCOPES } from '../services/enterprise.entitlement';

const getAdminContext = (req: Request): { adminId: string; actorRole?: string } | null => {
    const admin = (req as any).user;
    if (!admin?.id) return null;
    return {
        adminId: admin.id,
        actorRole: admin.role
    };
};

const logAdminEnterpriseAction = async (
    req: Request,
    action: AuditActionType,
    entity: string,
    details: string,
    targetId?: string,
    snapshot?: unknown
) => {
    const context = getAdminContext(req);
    if (!context) return;

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
const MAX_API_RATE_LIMIT_RPM = 1_000_000;
const ALLOWED_WORKSPACE_MEMBER_ROLES: WorkspaceMemberRole[] = [
    WorkspaceMemberRole.ADMIN,
    WorkspaceMemberRole.EDITOR,
    WorkspaceMemberRole.ANALYST,
    WorkspaceMemberRole.VIEWER
];

type EnterpriseAccessStatus = 'ACTIVE' | 'SUSPENDED';

const toCountNumber = (value: unknown): number => {
    if (typeof value === 'number') return value;
    if (typeof value === 'bigint') return Number(value);
    if (typeof value === 'string') {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
};

const resolveEnterpriseAccessStatus = (organization: {
    isRestricted: boolean;
    planStatus: PlanStatus;
}): EnterpriseAccessStatus => {
    if (organization.isRestricted) return 'SUSPENDED';
    if (organization.planStatus !== PlanStatus.ACTIVE) return 'SUSPENDED';
    return 'ACTIVE';
};

const resolvePageParams = (req: Request, defaults: { page?: number; limit?: number } = {}) => {
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

const resolveEnterpriseDefaultRpm = (values: Array<number | null | undefined>): number => {
    const rates = values.filter(
        (value): value is number =>
            typeof value === 'number'
            && Number.isFinite(value)
            && value >= MIN_API_RATE_LIMIT_RPM
            && value <= MAX_API_RATE_LIMIT_RPM
    );

    if (rates.length === 0) return ENTERPRISE_DEFAULT_RATE_LIMIT_RPM;

    const frequency = new Map<number, number>();
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

const isValidRateLimitOverride = (value: number | null | undefined): boolean => {
    if (value === null || value === undefined) return true;
    return Number.isInteger(value) && value >= MIN_API_RATE_LIMIT_RPM && value <= MAX_API_RATE_LIMIT_RPM;
};

const getWorkspaceIdsByEnterprise = async (organizationIds: string[]): Promise<Map<string, string[]>> => {
    const map = new Map<string, string[]>();
    if (organizationIds.length === 0) return map;

    const links = await prisma.workspaceOrganization.findMany({
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

const getWorkspaceUsageCounts = async (workspaceIds: string[]): Promise<Map<string, { requests7d: number; requests30d: number }>> => {
    const counts = new Map<string, { requests7d: number; requests30d: number }>();
    if (workspaceIds.length === 0) return counts;

    const since7 = new Date();
    since7.setDate(since7.getDate() - 7);
    const since30 = new Date();
    since30.setDate(since30.getDate() - 30);

    const rows = await prisma.$queryRaw<Array<{ workspaceId: string; requests7d: unknown; requests30d: unknown }>>`
        SELECT
            k."workspaceId" AS "workspaceId",
            SUM(CASE WHEN l."createdAt" >= ${since7} THEN 1 ELSE 0 END) AS "requests7d",
            COUNT(*) AS "requests30d"
        FROM "ApiUsageLog" l
        INNER JOIN "ApiKey" k ON l."apiKeyId" = k."id"
        WHERE
            k."workspaceId" IN (${Prisma.join(workspaceIds)})
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

const requireEnterpriseOrganization = async (orgId: string) => {
    const enterprise = await prisma.organization.findFirst({
        where: {
            id: orgId,
            planType: PlanType.ENTERPRISE,
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

export const listEnterprisesAdmin = async (req: Request, res: Response): Promise<void> => {
    try {
        const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
        const { page, limit, skip } = resolvePageParams(req, { page: 1, limit: 15 });

        const where: Prisma.OrganizationWhereInput = {
            planType: PlanType.ENTERPRISE,
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
            prisma.organization.findMany({
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
            prisma.organization.count({ where })
        ]);

        const orgIds = enterprises.map((org) => org.id);
        const workspaceMap = await getWorkspaceIdsByEnterprise(orgIds);
        const allWorkspaceIds = [...new Set(Array.from(workspaceMap.values()).flat())];

        const [workspaceRows, apiKeys, usageByWorkspace, keyOverrideRows] = await Promise.all([
            allWorkspaceIds.length > 0
                ? prisma.workspace.findMany({
                    where: { id: { in: allWorkspaceIds } },
                    select: {
                        id: true,
                        customApiRateLimitRpm: true
                    }
                })
                : Promise.resolve([]),
            allWorkspaceIds.length > 0
                ? prisma.apiKey.findMany({
                    where: { workspaceId: { in: allWorkspaceIds } },
                    select: {
                        id: true,
                        workspaceId: true
                    }
                })
                : Promise.resolve([]),
            getWorkspaceUsageCounts(allWorkspaceIds),
            allWorkspaceIds.length > 0
                ? prisma.$queryRaw<Array<{ workspaceId: string; count: unknown }>>`
                    SELECT
                        "workspaceId" AS "workspaceId",
                        COUNT(*) AS "count"
                    FROM "ApiKey"
                    WHERE
                        "workspaceId" IN (${Prisma.join(allWorkspaceIds)})
                        AND "rateLimitRpm" IS NOT NULL
                    GROUP BY "workspaceId"
                `
                : Promise.resolve([])
        ]);

        const workspaceRateMap = new Map(workspaceRows.map((ws) => [ws.id, ws.customApiRateLimitRpm]));
        const keyCountByWorkspace = new Map<string, number>();
        const keyOverrideByWorkspace = new Map<string, number>();

        for (const key of apiKeys) {
            keyCountByWorkspace.set(key.workspaceId, (keyCountByWorkspace.get(key.workspaceId) || 0) + 1);
        }

        for (const row of keyOverrideRows) {
            keyOverrideByWorkspace.set(row.workspaceId, toCountNumber(row.count));
        }

        const rows = enterprises.map((org) => {
            const workspaceIds = workspaceMap.get(org.id) || [];
            const workspaceCount = workspaceIds.length;

            const apiKeyCount = workspaceIds.reduce(
                (sum, workspaceId) => sum + (keyCountByWorkspace.get(workspaceId) || 0),
                0
            );
            const keyOverrideCount = workspaceIds.reduce(
                (sum, workspaceId) => sum + (keyOverrideByWorkspace.get(workspaceId) || 0),
                0
            );
            const workspaceOverrideCount = workspaceIds.reduce(
                (sum, workspaceId) => {
                    const override = workspaceRateMap.get(workspaceId);
                    return sum + (override !== null && override !== undefined ? 1 : 0);
                },
                0
            );
            const defaultRpm = resolveEnterpriseDefaultRpm(
                workspaceIds.map((workspaceId) => workspaceRateMap.get(workspaceId))
            );

            const requests7d = workspaceIds.reduce(
                (sum, workspaceId) => sum + (usageByWorkspace.get(workspaceId)?.requests7d || 0),
                0
            );
            const requests30d = workspaceIds.reduce(
                (sum, workspaceId) => sum + (usageByWorkspace.get(workspaceId)?.requests30d || 0),
                0
            );

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
    } catch (error: any) {
        console.error('[Admin Enterprise] List enterprises error:', error);
        res.status(500).json({ message: error.message || 'Failed to list enterprise organizations' });
    }
};

export const setEnterpriseAccessStatusAdmin = async (req: Request, res: Response): Promise<void> => {
    try {
        const orgId = req.params.orgId as string;
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

        const updated = await prisma.organization.update({
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

        await logAdminEnterpriseAction(
            req,
            AuditActionType.UPDATE,
            'Organization',
            `${statusInput === 'SUSPENDED' ? 'Suspended' : 'Activated'} enterprise access`,
            orgId,
            {
                previousStatus: resolveEnterpriseAccessStatus(organization),
                nextStatus: resolveEnterpriseAccessStatus(updated)
            }
        );

        res.json({
            enterprise: {
                id: updated.id,
                name: updated.name,
                accessStatus: resolveEnterpriseAccessStatus(updated),
                updatedAt: updated.updatedAt
            }
        });
    } catch (error: any) {
        console.error('[Admin Enterprise] Set enterprise access status error:', error);
        res.status(500).json({ message: error.message || 'Failed to update enterprise status' });
    }
};

export const getEnterpriseDetailAdmin = async (req: Request, res: Response): Promise<void> => {
    try {
        const orgId = req.params.orgId as string;
        const enterprise = await requireEnterpriseOrganization(orgId);
        if (!enterprise) {
            res.status(404).json({ message: 'Enterprise organization not found' });
            return;
        }

        const workspaceLinks = await prisma.workspaceOrganization.findMany({
            where: { organizationId: orgId },
            select: { workspaceId: true }
        });
        const workspaceIds = [...new Set(workspaceLinks.map((item) => item.workspaceId))];

        const [workspaces, members, apiKeys, usageByWorkspace, recentUsageLogs, complianceEvents, apiKeyRateRows] = await Promise.all([
            workspaceIds.length > 0
                ? prisma.workspace.findMany({
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
                ? prisma.workspaceMember.findMany({
                    where: { workspaceId: { in: workspaceIds } },
                    orderBy: { joinedAt: 'desc' }
                })
                : Promise.resolve([]),
            workspaceIds.length > 0
                ? prisma.apiKey.findMany({
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
                ? prisma.apiUsageLog.findMany({
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
            prisma.complianceIncident.findMany({
                where: { relatedId: orgId },
                orderBy: { createdAt: 'desc' },
                take: 10
            }),
            workspaceIds.length > 0
                ? prisma.$queryRaw<Array<{ id: string; rateLimitRpm: unknown }>>`
                    SELECT
                        "id",
                        "rateLimitRpm"
                    FROM "ApiKey"
                    WHERE "workspaceId" IN (${Prisma.join(workspaceIds)})
                `
                : Promise.resolve([])
        ]);

        const ownerIds = [...new Set(workspaces.map((ws) => ws.ownerId))];
        const owners = ownerIds.length > 0
            ? await prisma.user.findMany({
                where: { id: { in: ownerIds } },
                select: { id: true, name: true, email: true }
            })
            : [];
        const ownerMap = new Map(owners.map((owner) => [owner.id, owner]));
        const memberUserIds = [...new Set(members.map((member) => member.userId))];
        const memberUsers = memberUserIds.length > 0
            ? await prisma.user.findMany({
                where: { id: { in: memberUserIds } },
                select: { id: true, name: true, email: true, firstName: true, lastName: true }
            })
            : [];
        const memberUserMap = new Map(memberUsers.map((user) => [user.id, user]));
        const apiKeyRateMap = new Map(
            apiKeyRateRows.map((row) => [row.id, row.rateLimitRpm === null ? null : toCountNumber(row.rateLimitRpm)])
        );
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
            ? await prisma.workspaceOrganization.findMany({
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
            workspaces: workspaces.map((workspace: any) => ({
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
            apiKeys: apiKeys.map((key: any) => ({
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
    } catch (error: any) {
        console.error('[Admin Enterprise] Get enterprise detail error:', error);
        res.status(500).json({ message: error.message || 'Failed to get enterprise details' });
    }
};

export const listEnterpriseWorkspacesAdmin = async (req: Request, res: Response): Promise<void> => {
    try {
        const orgId = req.params.orgId as string;
        const enterprise = await requireEnterpriseOrganization(orgId);
        if (!enterprise) {
            res.status(404).json({ message: 'Enterprise organization not found' });
            return;
        }

        const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
        const { page, limit, skip } = resolvePageParams(req, { page: 1, limit: 15 });

        const links = await prisma.workspaceOrganization.findMany({
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

        const where: Prisma.WorkspaceWhereInput = {
            id: { in: workspaceIds },
            ...(search ? { name: { contains: search, mode: 'insensitive' } } : {})
        };

        const [workspaces, total] = await Promise.all([
            prisma.workspace.findMany({
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
            prisma.workspace.count({ where })
        ]);

        const ownerIds = [...new Set(workspaces.map((ws) => ws.ownerId))];
        const owners = ownerIds.length > 0
            ? await prisma.user.findMany({
                where: { id: { in: ownerIds } },
                select: { id: true, name: true, email: true }
            })
            : [];
        const ownerMap = new Map(owners.map((owner) => [owner.id, owner]));

        res.json({
            enterprise: { id: enterprise.id, name: enterprise.name },
            workspaces: workspaces.map((workspace: any) => ({
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
    } catch (error: any) {
        console.error('[Admin Enterprise] List enterprise workspaces error:', error);
        res.status(500).json({ message: error.message || 'Failed to list enterprise workspaces' });
    }
};

export const createEnterpriseWorkspaceForOrganizationAdmin = async (req: Request, res: Response): Promise<void> => {
    try {
        const orgId = req.params.orgId as string;
        const enterprise = await requireEnterpriseOrganization(orgId);
        if (!enterprise) {
            res.status(404).json({ message: 'Enterprise organization not found' });
            return;
        }

        const { name, ownerId, ownerEmail, status } = req.body as {
            name?: string;
            ownerId?: string;
            ownerEmail?: string;
            status?: WorkspaceStatus;
        };

        if (!name || typeof name !== 'string' || name.trim().length < 2) {
            res.status(400).json({ message: 'Workspace name must be at least 2 characters' });
            return;
        }

        let owner: { id: string; name: string; email: string } | null = null;
        if (ownerId && typeof ownerId === 'string') {
            owner = await prisma.user.findUnique({
                where: { id: ownerId },
                select: { id: true, name: true, email: true }
            });
        } else if (ownerEmail && typeof ownerEmail === 'string') {
            owner = await prisma.user.findFirst({
                where: { email: ownerEmail.trim().toLowerCase() },
                select: { id: true, name: true, email: true }
            });
        }

        if (!owner) {
            res.status(400).json({ message: 'Valid ownerId or ownerEmail is required' });
            return;
        }

        const safeStatus: WorkspaceStatus = ['ACTIVE', 'SUSPENDED', 'ARCHIVED'].includes(String(status))
            ? status as WorkspaceStatus
            : WorkspaceStatus.ACTIVE;

        const workspace = await prisma.$transaction(async (tx) => {
            const created = await tx.workspace.create({
                data: {
                    name: name.trim(),
                    status: safeStatus,
                    ownerId: owner.id,
                    members: {
                        create: {
                            userId: owner.id,
                            role: WorkspaceMemberRole.OWNER
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
        }, {
            timeout: 10_000,
            maxWait: 5_000
        });

        await logAdminEnterpriseAction(
            req,
            AuditActionType.CREATE,
            'Workspace',
            `Created workspace "${workspace.name}" for enterprise "${enterprise.name}"`,
            workspace.id,
            { organizationId: orgId, ownerId: owner.id }
        );

        res.status(201).json({
            workspace: {
                id: workspace.id,
                name: workspace.name,
                status: workspace.status,
                createdAt: workspace.createdAt,
                owner
            }
        });
    } catch (error: any) {
        console.error('[Admin Enterprise] Create enterprise workspace error:', error);
        res.status(400).json({ message: error.message || 'Failed to create workspace for enterprise' });
    }
};

export const getEnterpriseWorkspaceDetailAdmin = async (req: Request, res: Response): Promise<void> => {
    try {
        const orgId = req.params.orgId as string;
        const workspaceId = req.params.workspaceId as string;
        const enterprise = await requireEnterpriseOrganization(orgId);
        if (!enterprise) {
            res.status(404).json({ message: 'Enterprise organization not found' });
            return;
        }

        const link = await prisma.workspaceOrganization.findUnique({
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

        const workspace = await prisma.workspace.findUnique({
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
            listApiKeys(workspaceId),
            getWorkspaceUsageLogs(workspaceId, { limit, offset })
        ]);

        const memberUserIds = workspace.members.map((member) => member.userId);
        const userIds = [...new Set([workspace.ownerId, ...memberUserIds])];
        const users = userIds.length > 0
            ? await prisma.user.findMany({
                where: { id: { in: userIds } },
                select: { id: true, name: true, email: true, firstName: true, lastName: true }
            })
            : [];
        const userMap = new Map(users.map((user) => [user.id, user]));

        const linkedOrgIds = workspace.organizations.map((item) => item.organizationId);
        const organizations = linkedOrgIds.length > 0
            ? await prisma.organization.findMany({
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
    } catch (error: any) {
        console.error('[Admin Enterprise] Get enterprise workspace detail error:', error);
        res.status(500).json({ message: error.message || 'Failed to get workspace details' });
    }
};

export const addEnterpriseWorkspaceMemberAdmin = async (req: Request, res: Response): Promise<void> => {
    try {
        const orgId = req.params.orgId as string;
        const workspaceId = req.params.workspaceId as string;
        const { email, role } = req.body as { email?: string; role?: string };

        const enterprise = await requireEnterpriseOrganization(orgId);
        if (!enterprise) {
            res.status(404).json({ message: 'Enterprise organization not found' });
            return;
        }

        const link = await prisma.workspaceOrganization.findUnique({
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

        const workspace = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { id: true, name: true }
        });
        if (!workspace) {
            res.status(404).json({ message: 'Workspace not found' });
            return;
        }

        const user = await prisma.user.findFirst({
            where: { email: normalizedEmail },
            select: { id: true, name: true, email: true, firstName: true, lastName: true }
        });
        if (!user) {
            res.status(404).json({ message: 'User not found for the provided email' });
            return;
        }

        const existingMember = await prisma.workspaceMember.findUnique({
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
        const createdMember = await prisma.workspaceMember.create({
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

        await logAdminEnterpriseAction(
            req,
            AuditActionType.CREATE,
            'WorkspaceMember',
            'WORKSPACE_MEMBER_ADDED',
            createdMember.id,
            {
                actorAdminId,
                organizationId: orgId,
                workspaceId,
                workspaceName: workspace.name,
                targetUserId: user.id,
                targetEmail: user.email,
                role: createdMember.role,
                timestamp: new Date().toISOString()
            }
        );

        res.status(201).json({
            member: {
                ...createdMember,
                user
            }
        });
    } catch (error: any) {
        console.error('[Admin Enterprise] Add workspace member error:', error);
        res.status(500).json({ message: error.message || 'Failed to add workspace member' });
    }
};

export const createEnterpriseApiKeyAdmin = async (req: Request, res: Response): Promise<void> => {
    try {
        const orgId = req.params.orgId as string;
        const enterprise = await requireEnterpriseOrganization(orgId);
        if (!enterprise) {
            res.status(404).json({ message: 'Enterprise organization not found' });
            return;
        }

        const { workspaceId, name, scopes, expiresAt, rateLimitRpm } = req.body as {
            workspaceId?: string;
            name?: string;
            scopes?: string[];
            expiresAt?: string | null;
            rateLimitRpm?: number | null;
        };

        if (!workspaceId || typeof workspaceId !== 'string') {
            res.status(400).json({ message: 'workspaceId is required' });
            return;
        }

        const link = await prisma.workspaceOrganization.findUnique({
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
                availableScopes: Object.keys(API_SCOPES)
            });
            return;
        }

        const scopeValidation = validateScopes(scopes);
        if (!scopeValidation.valid) {
            res.status(400).json({
                message: `Invalid scopes: ${scopeValidation.invalidScopes.join(', ')}`,
                availableScopes: Object.keys(API_SCOPES)
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
        const result = await createApiKey({
            workspaceId,
            name: name.trim(),
            scopes,
            createdById: adminId,
            expiresAt: expiresAt ? new Date(expiresAt) : null,
            rateLimitRpm: rateLimitRpm ?? null,
            skipEnterpriseQuotaCheck: true
        });

        await logAdminEnterpriseAction(
            req,
            AuditActionType.CREATE,
            'ApiKey',
            `Created API key "${result.apiKey.name}" for enterprise "${enterprise.name}"`,
            result.apiKey.id,
            { organizationId: orgId, workspaceId, scopes }
        );

        res.status(201).json({
            apiKey: result.apiKey,
            plainTextKey: result.plainTextKey,
            warning: 'Store this key securely. It will not be shown again.'
        });
    } catch (error: any) {
        console.error('[Admin Enterprise] Create enterprise API key error:', error);
        res.status(400).json({ message: error.message || 'Failed to create API key' });
    }
};

export const updateEnterpriseRateLimitsAdmin = async (req: Request, res: Response): Promise<void> => {
    try {
        const orgId = req.params.orgId as string;
        const enterprise = await requireEnterpriseOrganization(orgId);
        if (!enterprise) {
            res.status(404).json({ message: 'Enterprise organization not found' });
            return;
        }

        const {
            defaultApiRateLimitRpm,
            workspaceOverrides,
            keyOverrides
        } = req.body as {
            defaultApiRateLimitRpm?: number | null;
            workspaceOverrides?: Array<{ workspaceId: string; apiRateLimitRpm: number | null }>;
            keyOverrides?: Array<{ workspaceId: string; keyId: string; rateLimitRpm: number | null }>;
        };

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

        const links = await prisma.workspaceOrganization.findMany({
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

        await prisma.$transaction(async (tx) => {
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

                await tx.$executeRaw`
                    UPDATE "ApiKey"
                    SET "rateLimitRpm" = ${item.rateLimitRpm ?? null}
                    WHERE "id" = ${item.keyId}
                `;
                keyOverrideCount += 1;
            }
        }, {
            timeout: 10_000,
            maxWait: 5_000
        });

        await logAdminEnterpriseAction(
            req,
            AuditActionType.UPDATE,
            'EnterpriseRateLimit',
            `Updated enterprise rate limits for "${enterprise.name}"`,
            orgId,
            {
                defaultApiRateLimitRpm: defaultApiRateLimitRpm ?? null,
                workspaceOverrides: workspaceOverrideCount,
                keyOverrides: keyOverrideCount
            }
        );

        res.json({
            success: true,
            applied: {
                defaultAppliedToWorkspaces: defaultAppliedTo,
                workspaceOverrides: workspaceOverrideCount,
                keyOverrides: keyOverrideCount
            }
        });
    } catch (error: any) {
        console.error('[Admin Enterprise] Update enterprise rate limits error:', error);
        res.status(500).json({ message: error.message || 'Failed to update enterprise rate limits' });
    }
};

export const getEnterpriseUsageAdmin = async (req: Request, res: Response): Promise<void> => {
    try {
        const orgId = req.params.orgId as string;
        const enterprise = await requireEnterpriseOrganization(orgId);
        if (!enterprise) {
            res.status(404).json({ message: 'Enterprise organization not found' });
            return;
        }

        const rangeRaw = String(req.query.range || '30').trim();
        const rangeDays = rangeRaw === '7' ? 7 : 30;
        const limit = typeof req.query.limit === 'string' ? Math.max(1, Math.min(200, parseInt(req.query.limit, 10) || 50)) : 50;
        const offset = typeof req.query.offset === 'string' ? Math.max(0, parseInt(req.query.offset, 10) || 0) : 0;

        const links = await prisma.workspaceOrganization.findMany({
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

        const dailyRows = await prisma.$queryRaw<Array<{ day: Date; count: unknown }>>`
            SELECT
                DATE_TRUNC('day', l."createdAt") AS "day",
                COUNT(*) AS "count"
            FROM "ApiUsageLog" l
            INNER JOIN "ApiKey" k ON l."apiKeyId" = k."id"
            WHERE
                k."workspaceId" IN (${Prisma.join(workspaceIds)})
                AND l."createdAt" >= ${sinceStart}
            GROUP BY "day"
            ORDER BY "day" ASC
        `;

        const byWorkspaceRows = await prisma.$queryRaw<Array<{ workspaceId: string; workspaceName: string; count: unknown }>>`
            SELECT
                k."workspaceId" AS "workspaceId",
                w."name" AS "workspaceName",
                COUNT(*) AS "count"
            FROM "ApiUsageLog" l
            INNER JOIN "ApiKey" k ON l."apiKeyId" = k."id"
            INNER JOIN "Workspace" w ON k."workspaceId" = w."id"
            WHERE
                k."workspaceId" IN (${Prisma.join(workspaceIds)})
                AND l."createdAt" >= ${sinceStart}
            GROUP BY k."workspaceId", w."name"
            ORDER BY COUNT(*) DESC
        `;

        const [logs, totalLogs] = await Promise.all([
            prisma.apiUsageLog.findMany({
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
            prisma.apiUsageLog.count({
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
    } catch (error: any) {
        console.error('[Admin Enterprise] Get enterprise usage error:', error);
        res.status(500).json({ message: error.message || 'Failed to load enterprise usage' });
    }
};

// ============================================
// List Enterprise Workspaces
// ============================================

export const listEnterpriseWorkspaces = async (req: Request, res: Response): Promise<void> => {
    try {
        const search = typeof req.query.search === 'string' ? req.query.search : undefined;
        const pageStr = typeof req.query.page === 'string' ? req.query.page : '1';
        const limitStr = typeof req.query.limit === 'string' ? req.query.limit : '20';
        const pageNum = Math.max(1, parseInt(pageStr, 10) || 1);
        const limitNum = Math.min(50, Math.max(1, parseInt(limitStr, 10) || 20));
        const skip = (pageNum - 1) * limitNum;

        const where: any = {};
        if (search && search.trim()) {
            where.name = { contains: search.trim(), mode: 'insensitive' };
        }

        const [workspaces, total] = await Promise.all([
            prisma.workspace.findMany({
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
            prisma.workspace.count({ where })
        ]);

        // Fetch owner names in one go
        const ownerIds = [...new Set(workspaces.map(w => w.ownerId))];
        const owners = await prisma.user.findMany({
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
                memberCount: (w as any)._count.members,
                apiKeyCount: (w as any)._count.apiKeys,
                orgCount: (w as any)._count.organizations
            })),
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                totalPages: Math.ceil(total / limitNum)
            }
        });
    } catch (error: any) {
        console.error('[Admin Enterprise] List workspaces error:', error);
        res.status(500).json({ message: error.message || 'Failed to list workspaces' });
    }
};

// ============================================
// Workspace CRUD (Super Admin)
// ============================================

export const createEnterpriseWorkspaceAdmin = async (req: Request, res: Response): Promise<void> => {
    try {
        const { name, ownerId, ownerEmail, status } = req.body as {
            name?: string;
            ownerId?: string;
            ownerEmail?: string;
            status?: WorkspaceStatus;
        };

        if (!name || typeof name !== 'string' || name.trim().length < 2) {
            res.status(400).json({ message: 'Workspace name must be at least 2 characters' });
            return;
        }

        let owner: { id: string } | null = null;
        if (ownerId && typeof ownerId === 'string') {
            owner = await prisma.user.findUnique({ where: { id: ownerId }, select: { id: true } });
        } else if (ownerEmail && typeof ownerEmail === 'string') {
            owner = await prisma.user.findFirst({
                where: { email: ownerEmail.trim().toLowerCase() },
                select: { id: true }
            });
        }

        if (!owner) {
            res.status(400).json({ message: 'Valid ownerId or ownerEmail is required' });
            return;
        }

        const safeStatus: WorkspaceStatus = ['ACTIVE', 'SUSPENDED', 'ARCHIVED'].includes(String(status))
            ? status as WorkspaceStatus
            : WorkspaceStatus.ACTIVE;

        const workspace = await prisma.workspace.create({
            data: {
                name: name.trim(),
                status: safeStatus,
                ownerId: owner.id,
                members: {
                    create: {
                        userId: owner.id,
                        role: WorkspaceMemberRole.OWNER
                    }
                }
            }
        });

        await logAdminEnterpriseAction(
            req,
            AuditActionType.CREATE,
            'Workspace',
            `Created workspace "${workspace.name}"`,
            workspace.id,
            { ownerId: owner.id, status: workspace.status }
        );

        res.status(201).json({ workspace });
    } catch (error: any) {
        console.error('[Admin Enterprise] Create workspace error:', error);
        res.status(400).json({ message: error.message || 'Failed to create workspace' });
    }
};

export const updateEnterpriseWorkspaceAdmin = async (req: Request, res: Response): Promise<void> => {
    try {
        const id = req.params.id as string;
        const { name, status } = req.body as { name?: string; status?: WorkspaceStatus };

        const workspace = await prisma.workspace.findUnique({ where: { id }, select: { id: true, name: true, status: true } });
        if (!workspace) {
            res.status(404).json({ message: 'Workspace not found' });
            return;
        }

        const updateData: { name?: string; status?: WorkspaceStatus } = {};
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

        const updated = await prisma.workspace.update({
            where: { id },
            data: updateData
        });

        await logAdminEnterpriseAction(
            req,
            AuditActionType.UPDATE,
            'Workspace',
            `Updated workspace "${workspace.name}"`,
            id,
            { before: workspace, after: updated }
        );

        res.json({ workspace: updated });
    } catch (error: any) {
        console.error('[Admin Enterprise] Update workspace error:', error);
        res.status(400).json({ message: error.message || 'Failed to update workspace' });
    }
};

export const deleteEnterpriseWorkspaceAdmin = async (req: Request, res: Response): Promise<void> => {
    try {
        const id = req.params.id as string;

        const workspace = await prisma.workspace.findUnique({
            where: { id },
            select: { id: true, name: true }
        });
        if (!workspace) {
            res.status(404).json({ message: 'Workspace not found' });
            return;
        }

        await prisma.$transaction(async (tx) => {
            await tx.workspaceMember.deleteMany({ where: { workspaceId: id } });
            await tx.$executeRaw`DELETE FROM "Invite" WHERE "workspaceId" = ${id}`;
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
        }, {
            timeout: 10_000,
            maxWait: 5_000
        });

        await logAdminEnterpriseAction(
            req,
            AuditActionType.DELETE,
            'Workspace',
            `Deleted workspace "${workspace.name}"`,
            id
        );

        res.json({ success: true });
    } catch (error: any) {
        console.error('[Admin Enterprise] Delete workspace error:', error);
        res.status(400).json({ message: error.message || 'Failed to delete workspace' });
    }
};

// ============================================
// Get Workspace Details
// ============================================

export const getWorkspaceDetails = async (req: Request, res: Response): Promise<void> => {
    try {
        const id = req.params.id as string;

        const workspace: any = await prisma.workspace.findUnique({
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
        const memberUserIds = workspace.members.map((m: any) => m.userId);
        const allUserIds = [...new Set([workspace.ownerId, ...memberUserIds])];
        const users = await prisma.user.findMany({
            where: { id: { in: allUserIds as string[] } },
            select: { id: true, name: true, email: true, firstName: true, lastName: true }
        });
        const userMap = new Map(users.map(u => [u.id, u]));

        // Fetch linked org details
        const orgIds = workspace.organizations.map((wo: any) => wo.organizationId);
        const orgs = orgIds.length > 0 ? await prisma.organization.findMany({
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
            members: workspace.members.map((m: any) => ({
                id: m.id,
                userId: m.userId,
                role: m.role,
                joinedAt: m.joinedAt,
                user: userMap.get(m.userId) || null
            })),
            linkedOrgs: workspace.organizations.map((lo: any) => ({
                id: lo.id,
                organizationId: lo.organizationId,
                linkedAt: lo.createdAt,
                organization: orgMap.get(lo.organizationId) || null
            }))
        });
    } catch (error: any) {
        console.error('[Admin Enterprise] Get workspace details error:', error);
        res.status(500).json({ message: error.message || 'Failed to get workspace details' });
    }
};

// ============================================
// List Workspace API Keys
// ============================================

export const listWorkspaceApiKeys = async (req: Request, res: Response): Promise<void> => {
    try {
        const id = req.params.id as string;

        const workspace = await prisma.workspace.findUnique({ where: { id }, select: { id: true } });
        if (!workspace) {
            res.status(404).json({ message: 'Workspace not found' });
            return;
        }

        const apiKeys = await listApiKeys(id);
        res.json({ apiKeys });
    } catch (error: any) {
        console.error('[Admin Enterprise] List API keys error:', error);
        res.status(500).json({ message: error.message || 'Failed to list API keys' });
    }
};

// ============================================
// Revoke API Key (Admin)
// ============================================

export const revokeWorkspaceApiKey = async (req: Request, res: Response): Promise<void> => {
    try {
        const id = req.params.id as string;
        const keyId = req.params.keyId as string;

        const workspace = await prisma.workspace.findUnique({ where: { id }, select: { id: true } });
        if (!workspace) {
            res.status(404).json({ message: 'Workspace not found' });
            return;
        }

        const apiKey = await getApiKeyById(keyId);
        if (!apiKey) {
            res.status(404).json({ message: 'API key not found' });
            return;
        }
        if (apiKey.workspaceId !== id) {
            res.status(400).json({ message: 'API key does not belong to this workspace' });
            return;
        }

        await revokeApiKey(keyId);
        await logAdminEnterpriseAction(
            req,
            AuditActionType.UPDATE,
            'ApiKey',
            `Revoked API key "${apiKey.name}"`,
            keyId,
            { workspaceId: id }
        );
        res.json({ success: true, message: 'API key revoked' });
    } catch (error: any) {
        console.error('[Admin Enterprise] Revoke API key error:', error);
        res.status(400).json({ message: error.message || 'Failed to revoke API key' });
    }
};

export const rotateWorkspaceApiKeyAdmin = async (req: Request, res: Response): Promise<void> => {
    try {
        const id = req.params.id as string;
        const keyId = req.params.keyId as string;
        const actorId = (req as any).user?.id as string | undefined;

        if (!actorId) {
            res.status(401).json({ message: 'Unauthorized' });
            return;
        }

        const workspace = await prisma.workspace.findUnique({ where: { id }, select: { id: true } });
        if (!workspace) {
            res.status(404).json({ message: 'Workspace not found' });
            return;
        }

        const apiKey = await getApiKeyById(keyId);
        if (!apiKey) {
            res.status(404).json({ message: 'API key not found' });
            return;
        }
        if (apiKey.workspaceId !== id) {
            res.status(400).json({ message: 'API key does not belong to this workspace' });
            return;
        }

        const result = await rotateApiKey(keyId, actorId);
        await logAdminEnterpriseAction(
            req,
            AuditActionType.UPDATE,
            'ApiKey',
            `Rotated API key "${apiKey.name}"`,
            keyId,
            { workspaceId: id }
        );

        res.status(201).json({
            apiKey: result.apiKey,
            plainTextKey: result.plainTextKey,
            warning: 'Store this key securely. It will not be shown again.'
        });
    } catch (error: any) {
        console.error('[Admin Enterprise] Rotate API key error:', error);
        res.status(400).json({ message: error.message || 'Failed to rotate API key' });
    }
};

// ============================================
// Get Workspace Usage Logs
// ============================================

export const getWorkspaceUsageLogsAdmin = async (req: Request, res: Response): Promise<void> => {
    try {
        const id = req.params.id as string;
        const limitVal = typeof req.query.limit === 'string' ? parseInt(req.query.limit, 10) : undefined;
        const offsetVal = typeof req.query.offset === 'string' ? parseInt(req.query.offset, 10) : undefined;
        const apiKeyId = typeof req.query.apiKeyId === 'string' ? req.query.apiKeyId : undefined;

        const workspace = await prisma.workspace.findUnique({ where: { id }, select: { id: true } });
        if (!workspace) {
            res.status(404).json({ message: 'Workspace not found' });
            return;
        }

        const result = await getWorkspaceUsageLogs(id, {
            limit: limitVal,
            offset: offsetVal,
            apiKeyId
        });

        res.json(result);
    } catch (error: any) {
        console.error('[Admin Enterprise] Get usage logs error:', error);
        res.status(500).json({ message: error.message || 'Failed to get usage logs' });
    }
};

export const getGlobalUsageLogsAdmin = async (req: Request, res: Response): Promise<void> => {
    try {
        const limit = typeof req.query.limit === 'string' ? parseInt(req.query.limit, 10) : undefined;
        const offset = typeof req.query.offset === 'string' ? parseInt(req.query.offset, 10) : undefined;
        const workspaceId = typeof req.query.workspaceId === 'string' ? req.query.workspaceId : undefined;
        const apiKeyId = typeof req.query.apiKeyId === 'string' ? req.query.apiKeyId : undefined;

        const result = await getGlobalUsageLogs({
            limit,
            offset,
            workspaceId,
            apiKeyId
        });
        res.json(result);
    } catch (error: any) {
        console.error('[Admin Enterprise] Global usage logs error:', error);
        res.status(500).json({ message: error.message || 'Failed to get usage logs' });
    }
};

// ============================================
// Update Workspace Rate Limits (Issue B)
// ============================================

export const updateWorkspaceRateLimits = async (req: Request, res: Response): Promise<void> => {
    try {
        const id = req.params.id as string;
        const { apiRateLimitRpm, apiDailyQuota } = req.body;

        const workspace = await prisma.workspace.findUnique({ where: { id }, select: { id: true } });
        if (!workspace) {
            res.status(404).json({ message: 'Workspace not found' });
            return;
        }

        // Validate inputs — null clears the override (falls back to plan default)
        const updateData: any = {};
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

        const updated = await prisma.workspace.update({
            where: { id },
            data: updateData,
            select: {
                id: true,
                name: true,
                customApiRateLimitRpm: true,
                customApiDailyQuota: true
            }
        });

        await logAdminEnterpriseAction(
            req,
            AuditActionType.UPDATE,
            'Workspace',
            `Updated workspace rate limits for "${updated.name}"`,
            id,
            updated
        );

        res.json({
            success: true,
            workspace: updated
        });
    } catch (error: any) {
        console.error('[Admin Enterprise] Update rate limits error:', error);
        res.status(500).json({ message: error.message || 'Failed to update rate limits' });
    }
};

export const updateWorkspaceApiKeyRateLimitAdmin = async (req: Request, res: Response): Promise<void> => {
    try {
        const workspaceId = req.params.id as string;
        const keyId = req.params.keyId as string;
        const { rateLimitRpm } = req.body as { rateLimitRpm?: number | null };

        const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { id: true } });
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

        const apiKey = await getApiKeyById(keyId);
        if (!apiKey) {
            res.status(404).json({ message: 'API key not found' });
            return;
        }
        if (apiKey.workspaceId !== workspaceId) {
            res.status(400).json({ message: 'API key does not belong to this workspace' });
            return;
        }

        const updatedKey = await updateApiKeyRateLimit(keyId, rateLimitRpm ?? null);
        await logAdminEnterpriseAction(
            req,
            AuditActionType.UPDATE,
            'ApiKey',
            `Updated API key rate limit for "${updatedKey.name}"`,
            keyId,
            { workspaceId, rateLimitRpm: updatedKey.rateLimitRpm }
        );

        res.json({ success: true, apiKey: updatedKey });
    } catch (error: any) {
        console.error('[Admin Enterprise] Update API key rate limit error:', error);
        res.status(500).json({ message: error.message || 'Failed to update API key rate limit' });
    }
};

// ============================================
// Create API Key for Workspace (Issue C)
// ============================================

export const createWorkspaceApiKeyAdmin = async (req: Request, res: Response): Promise<void> => {
    try {
        const id = req.params.id as string;
        const { name, scopes, expiresAt, rateLimitRpm } = req.body;

        const workspace = await prisma.workspace.findUnique({ where: { id }, select: { id: true } });
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
                availableScopes: Object.keys(API_SCOPES)
            });
            return;
        }

        const scopeValidation = validateScopes(scopes);
        if (!scopeValidation.valid) {
            res.status(400).json({
                message: `Invalid scopes: ${scopeValidation.invalidScopes.join(', ')}`,
                availableScopes: Object.keys(API_SCOPES)
            });
            return;
        }

        // Use adminId as createdById (from auth middleware)
        const adminId = (req as any).user?.id || 'admin';

        if (rateLimitRpm !== undefined && rateLimitRpm !== null) {
            if (typeof rateLimitRpm !== 'number' || rateLimitRpm < 0) {
                res.status(400).json({ message: 'rateLimitRpm must be a non-negative number or null' });
                return;
            }
        }

        const result = await createApiKey({
            workspaceId: id,
            name: name.trim(),
            scopes,
            createdById: adminId,
            expiresAt: expiresAt ? new Date(expiresAt) : null,
            rateLimitRpm: rateLimitRpm ?? null,
            skipEnterpriseQuotaCheck: true
        });

        await logAdminEnterpriseAction(
            req,
            AuditActionType.CREATE,
            'ApiKey',
            `Created API key "${result.apiKey.name}"`,
            result.apiKey.id,
            { workspaceId: id, scopes }
        );

        res.status(201).json({
            apiKey: result.apiKey,
            plainTextKey: result.plainTextKey,
            warning: 'Store this key securely. It will not be shown again.'
        });
    } catch (error: any) {
        console.error('[Admin Enterprise] Create API key error:', error);
        res.status(400).json({ message: error.message || 'Failed to create API key' });
    }
};
