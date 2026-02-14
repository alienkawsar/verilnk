import { PlanStatus, PlanType, OrgStatus } from '@prisma/client';
import { prisma } from '../db/client';

export type EnterpriseQuotaResource = 'WORKSPACES' | 'LINKED_ORGS' | 'API_KEYS' | 'MEMBERS';

export interface EnterpriseQuotaLimits {
    maxWorkspaces: number;
    maxLinkedOrgs: number;
    maxApiKeys: number;
    maxMembers: number;
}

export interface EnterpriseQuotaUsage {
    workspaces: number;
    linkedOrgs: number;
    apiKeys: number;
    members: number;
}

export interface EnterpriseQuotaSnapshot {
    enterpriseId: string;
    limits: EnterpriseQuotaLimits;
    usage: EnterpriseQuotaUsage;
    workspaceIds: string[];
    trackedLinkedOrganizationIds: Set<string>;
}

export const DEFAULT_ENTERPRISE_QUOTAS: EnterpriseQuotaLimits = {
    maxWorkspaces: 10,
    maxLinkedOrgs: 50,
    maxApiKeys: 10,
    maxMembers: 100
};

const toNullableNumber = (value: unknown): number | null => {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'bigint') return Number(value);
    if (typeof value === 'string') {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
};

const normalizeLimit = (value: number | null | undefined, fallback: number): number => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
    const rounded = Math.floor(value);
    return rounded < 1 ? fallback : rounded;
};

const hasActiveEnterprisePlan = (organization: {
    planType: PlanType;
    planStatus: PlanStatus;
    status: OrgStatus;
    isRestricted: boolean;
    planEndAt: Date | null;
}): boolean => {
    if (organization.planType !== PlanType.ENTERPRISE) return false;
    if (organization.planStatus !== PlanStatus.ACTIVE) return false;
    if (organization.status !== OrgStatus.APPROVED) return false;
    if (organization.isRestricted) return false;
    if (organization.planEndAt && organization.planEndAt.getTime() < Date.now()) return false;
    return true;
};

export const normalizeEnterpriseQuotaLimits = (source?: {
    enterpriseMaxWorkspaces?: number | null;
    enterpriseMaxLinkedOrgs?: number | null;
    enterpriseMaxApiKeys?: number | null;
    enterpriseMaxMembers?: number | null;
}): EnterpriseQuotaLimits => {
    return {
        maxWorkspaces: normalizeLimit(source?.enterpriseMaxWorkspaces, DEFAULT_ENTERPRISE_QUOTAS.maxWorkspaces),
        maxLinkedOrgs: normalizeLimit(source?.enterpriseMaxLinkedOrgs, DEFAULT_ENTERPRISE_QUOTAS.maxLinkedOrgs),
        maxApiKeys: normalizeLimit(source?.enterpriseMaxApiKeys, DEFAULT_ENTERPRISE_QUOTAS.maxApiKeys),
        maxMembers: normalizeLimit(source?.enterpriseMaxMembers, DEFAULT_ENTERPRISE_QUOTAS.maxMembers)
    };
};

export const resolveEnterpriseOrganizationIdForWorkspace = async (
    workspaceId: string
): Promise<string | null> => {
    const workspaceLinks = await prisma.workspaceOrganization.findMany({
        where: { workspaceId },
        select: { organizationId: true, createdAt: true },
        orderBy: { createdAt: 'asc' }
    });

    if (workspaceLinks.length === 0) return null;

    const organizationIds = Array.from(new Set(workspaceLinks.map((link) => link.organizationId)));
    const organizations = await prisma.organization.findMany({
        where: { id: { in: organizationIds } },
        select: {
            id: true,
            planType: true,
            planStatus: true,
            status: true,
            isRestricted: true,
            planEndAt: true
        }
    });
    const organizationMap = new Map(organizations.map((organization) => [organization.id, organization]));

    for (const link of workspaceLinks) {
        const organization = organizationMap.get(link.organizationId);
        if (organization && hasActiveEnterprisePlan(organization)) {
            return organization.id;
        }
    }

    for (const link of workspaceLinks) {
        const organization = organizationMap.get(link.organizationId);
        if (organization?.planType === PlanType.ENTERPRISE) {
            return organization.id;
        }
    }

    return null;
};

export const getEnterpriseQuotaSnapshotByOrganizationId = async (
    enterpriseId: string
): Promise<EnterpriseQuotaSnapshot> => {
    const quotaRows = await prisma.$queryRaw<Array<{
        id: string;
        enterpriseMaxWorkspaces: unknown;
        enterpriseMaxLinkedOrgs: unknown;
        enterpriseMaxApiKeys: unknown;
        enterpriseMaxMembers: unknown;
    }>>`
        SELECT
            "id",
            "enterpriseMaxWorkspaces",
            "enterpriseMaxLinkedOrgs",
            "enterpriseMaxApiKeys",
            "enterpriseMaxMembers"
        FROM "Organization"
        WHERE "id" = ${enterpriseId}
        LIMIT 1
    `;
    const quotaRow = quotaRows[0];

    if (!quotaRow) {
        throw new Error('Enterprise organization not found');
    }

    const limits = normalizeEnterpriseQuotaLimits({
        enterpriseMaxWorkspaces: toNullableNumber(quotaRow.enterpriseMaxWorkspaces),
        enterpriseMaxLinkedOrgs: toNullableNumber(quotaRow.enterpriseMaxLinkedOrgs),
        enterpriseMaxApiKeys: toNullableNumber(quotaRow.enterpriseMaxApiKeys),
        enterpriseMaxMembers: toNullableNumber(quotaRow.enterpriseMaxMembers)
    });

    const workspaceLinks = await prisma.workspaceOrganization.findMany({
        where: { organizationId: enterpriseId },
        select: { workspaceId: true }
    });

    const workspaceIds = Array.from(new Set(workspaceLinks.map((item) => item.workspaceId)));

    if (workspaceIds.length === 0) {
        return {
            enterpriseId,
            limits,
            usage: {
                workspaces: 0,
                linkedOrgs: 0,
                apiKeys: 0,
                members: 0
            },
            workspaceIds,
            trackedLinkedOrganizationIds: new Set<string>()
        };
    }

    const linkRequestModel = (prisma as any).enterpriseOrgLinkRequest;

    const [linkedOrgRows, activeApiKeyCount, workspaceMemberCount, pendingInviteCount, pendingRequests] = await Promise.all([
        prisma.workspaceOrganization.findMany({
            where: { workspaceId: { in: workspaceIds } },
            select: { organizationId: true }
        }),
        prisma.apiKey.count({
            where: {
                workspaceId: { in: workspaceIds },
                revokedAt: null
            }
        }),
        prisma.workspaceMember.count({
            where: { workspaceId: { in: workspaceIds } }
        }),
        prisma.invite.count({
            where: {
                workspaceId: { in: workspaceIds },
                status: 'PENDING'
            }
        }),
        linkRequestModel?.findMany
            ? linkRequestModel.findMany({
                where: {
                    enterpriseId,
                    status: { in: ['PENDING', 'PENDING_APPROVAL'] }
                },
                select: { organizationId: true }
            })
            : Promise.resolve([])
    ]);

    const trackedLinkedOrganizationIds = new Set<string>();

    for (const linkedOrg of linkedOrgRows) {
        if (linkedOrg.organizationId && linkedOrg.organizationId !== enterpriseId) {
            trackedLinkedOrganizationIds.add(linkedOrg.organizationId);
        }
    }

    if (Array.isArray(pendingRequests)) {
        for (const request of pendingRequests) {
            const organizationId = (request as { organizationId?: string | null }).organizationId;
            if (organizationId && organizationId !== enterpriseId) {
                trackedLinkedOrganizationIds.add(organizationId);
            }
        }
    }

    return {
        enterpriseId,
        limits,
        usage: {
            workspaces: workspaceIds.length,
            linkedOrgs: trackedLinkedOrganizationIds.size,
            apiKeys: activeApiKeyCount,
            members: workspaceMemberCount + pendingInviteCount
        },
        workspaceIds,
        trackedLinkedOrganizationIds
    };
};

export const getEnterpriseQuotaSnapshotByWorkspaceId = async (
    workspaceId: string
): Promise<EnterpriseQuotaSnapshot | null> => {
    const enterpriseId = await resolveEnterpriseOrganizationIdForWorkspace(workspaceId);
    if (!enterpriseId) return null;
    return getEnterpriseQuotaSnapshotByOrganizationId(enterpriseId);
};

const RESOURCE_LABELS: Record<EnterpriseQuotaResource, string> = {
    WORKSPACES: 'Workspaces',
    LINKED_ORGS: 'Linked Organizations',
    API_KEYS: 'API Keys',
    MEMBERS: 'Members'
};

export class EnterpriseLimitReachedError extends Error {
    resource: EnterpriseQuotaResource;
    limit: number;
    current: number;

    constructor(resource: EnterpriseQuotaResource, limit: number, current: number, message?: string) {
        super(message || `Limit reached for ${RESOURCE_LABELS[resource]}`);
        this.name = 'EnterpriseLimitReachedError';
        this.resource = resource;
        this.limit = limit;
        this.current = current;
    }
}

export const isEnterpriseLimitReachedError = (error: unknown): error is EnterpriseLimitReachedError => {
    return error instanceof EnterpriseLimitReachedError;
};

export const toEnterpriseLimitResponse = (error: EnterpriseLimitReachedError) => ({
    error: 'LIMIT_REACHED',
    resource: error.resource,
    limit: error.limit,
    current: error.current,
    message: error.message
});

const getLimitAndCurrent = (
    snapshot: EnterpriseQuotaSnapshot,
    resource: EnterpriseQuotaResource
): { limit: number; current: number } => {
    if (resource === 'WORKSPACES') {
        return { limit: snapshot.limits.maxWorkspaces, current: snapshot.usage.workspaces };
    }
    if (resource === 'LINKED_ORGS') {
        return { limit: snapshot.limits.maxLinkedOrgs, current: snapshot.usage.linkedOrgs };
    }
    if (resource === 'API_KEYS') {
        return { limit: snapshot.limits.maxApiKeys, current: snapshot.usage.apiKeys };
    }
    return { limit: snapshot.limits.maxMembers, current: snapshot.usage.members };
};

export const assertEnterpriseQuotaAvailable = (
    snapshot: EnterpriseQuotaSnapshot,
    resource: EnterpriseQuotaResource,
    options: {
        increment?: number;
        linkedOrganizationId?: string | null;
    } = {}
): void => {
    const { limit, current } = getLimitAndCurrent(snapshot, resource);

    let increment = typeof options.increment === 'number' ? Math.max(0, options.increment) : 1;

    if (resource === 'LINKED_ORGS' && options.linkedOrganizationId) {
        if (snapshot.trackedLinkedOrganizationIds.has(options.linkedOrganizationId)) {
            increment = 0;
        }
    }

    if (increment <= 0) {
        return;
    }

    if (current + increment > limit) {
        throw new EnterpriseLimitReachedError(resource, limit, current);
    }
};

export const assertEnterpriseQuotaByOrganizationId = async (
    enterpriseId: string,
    resource: EnterpriseQuotaResource,
    options: {
        increment?: number;
        linkedOrganizationId?: string | null;
    } = {}
): Promise<EnterpriseQuotaSnapshot> => {
    const snapshot = await getEnterpriseQuotaSnapshotByOrganizationId(enterpriseId);
    assertEnterpriseQuotaAvailable(snapshot, resource, options);
    return snapshot;
};

export const assertEnterpriseQuotaByWorkspaceId = async (
    workspaceId: string,
    resource: EnterpriseQuotaResource,
    options: {
        increment?: number;
        linkedOrganizationId?: string | null;
    } = {}
): Promise<EnterpriseQuotaSnapshot | null> => {
    const snapshot = await getEnterpriseQuotaSnapshotByWorkspaceId(workspaceId);
    if (!snapshot) return null;
    assertEnterpriseQuotaAvailable(snapshot, resource, options);
    return snapshot;
};
