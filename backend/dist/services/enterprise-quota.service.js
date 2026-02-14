"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertEnterpriseQuotaByWorkspaceId = exports.assertEnterpriseQuotaByOrganizationId = exports.assertEnterpriseQuotaAvailable = exports.toEnterpriseLimitResponse = exports.isEnterpriseLimitReachedError = exports.EnterpriseLimitReachedError = exports.getEnterpriseQuotaSnapshotByWorkspaceId = exports.getEnterpriseQuotaSnapshotByOrganizationId = exports.resolveEnterpriseOrganizationIdForWorkspace = exports.normalizeEnterpriseQuotaLimits = exports.DEFAULT_ENTERPRISE_QUOTAS = void 0;
const client_1 = require("@prisma/client");
const client_2 = require("../db/client");
exports.DEFAULT_ENTERPRISE_QUOTAS = {
    maxWorkspaces: 10,
    maxLinkedOrgs: 50,
    maxApiKeys: 10,
    maxMembers: 100
};
const toNumber = (value, fallback = 0) => {
    if (typeof value === 'number' && Number.isFinite(value))
        return value;
    if (typeof value === 'bigint')
        return Number(value);
    if (typeof value === 'string') {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : fallback;
    }
    return fallback;
};
const toNullableNumber = (value) => {
    if (value === null || value === undefined)
        return null;
    if (typeof value === 'number' && Number.isFinite(value))
        return value;
    if (typeof value === 'bigint')
        return Number(value);
    if (typeof value === 'string') {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
};
const normalizeLimit = (value, fallback) => {
    if (typeof value !== 'number' || !Number.isFinite(value))
        return fallback;
    const rounded = Math.floor(value);
    return rounded < 1 ? fallback : rounded;
};
const hasActiveEnterprisePlan = (organization) => {
    if (organization.planType !== client_1.PlanType.ENTERPRISE)
        return false;
    if (organization.planStatus !== client_1.PlanStatus.ACTIVE)
        return false;
    if (organization.status !== client_1.OrgStatus.APPROVED)
        return false;
    if (organization.isRestricted)
        return false;
    if (organization.planEndAt && organization.planEndAt.getTime() < Date.now())
        return false;
    return true;
};
const normalizeEnterpriseQuotaLimits = (source) => {
    return {
        maxWorkspaces: normalizeLimit(source?.enterpriseMaxWorkspaces, exports.DEFAULT_ENTERPRISE_QUOTAS.maxWorkspaces),
        maxLinkedOrgs: normalizeLimit(source?.enterpriseMaxLinkedOrgs, exports.DEFAULT_ENTERPRISE_QUOTAS.maxLinkedOrgs),
        maxApiKeys: normalizeLimit(source?.enterpriseMaxApiKeys, exports.DEFAULT_ENTERPRISE_QUOTAS.maxApiKeys),
        maxMembers: normalizeLimit(source?.enterpriseMaxMembers, exports.DEFAULT_ENTERPRISE_QUOTAS.maxMembers)
    };
};
exports.normalizeEnterpriseQuotaLimits = normalizeEnterpriseQuotaLimits;
const resolveEnterpriseOrganizationIdForWorkspace = async (workspaceId) => {
    const workspaceLinks = await client_2.prisma.workspaceOrganization.findMany({
        where: { workspaceId },
        select: { organizationId: true, createdAt: true },
        orderBy: { createdAt: 'asc' }
    });
    if (workspaceLinks.length === 0)
        return null;
    const organizationIds = Array.from(new Set(workspaceLinks.map((link) => link.organizationId)));
    const organizations = await client_2.prisma.organization.findMany({
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
        if (organization?.planType === client_1.PlanType.ENTERPRISE) {
            return organization.id;
        }
    }
    return null;
};
exports.resolveEnterpriseOrganizationIdForWorkspace = resolveEnterpriseOrganizationIdForWorkspace;
const getEnterpriseQuotaSnapshotByOrganizationId = async (enterpriseId) => {
    const quotaRows = await client_2.prisma.$queryRaw `
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
    const limits = (0, exports.normalizeEnterpriseQuotaLimits)({
        enterpriseMaxWorkspaces: toNullableNumber(quotaRow.enterpriseMaxWorkspaces),
        enterpriseMaxLinkedOrgs: toNullableNumber(quotaRow.enterpriseMaxLinkedOrgs),
        enterpriseMaxApiKeys: toNullableNumber(quotaRow.enterpriseMaxApiKeys),
        enterpriseMaxMembers: toNullableNumber(quotaRow.enterpriseMaxMembers)
    });
    const workspaceLinks = await client_2.prisma.workspaceOrganization.findMany({
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
            trackedLinkedOrganizationIds: new Set()
        };
    }
    const linkRequestModel = client_2.prisma.enterpriseOrgLinkRequest;
    const [linkedOrgRows, activeApiKeyCount, workspaceMemberCount, pendingInviteRows, pendingRequests] = await Promise.all([
        client_2.prisma.workspaceOrganization.findMany({
            where: { workspaceId: { in: workspaceIds } },
            select: { organizationId: true }
        }),
        client_2.prisma.apiKey.count({
            where: {
                workspaceId: { in: workspaceIds },
                revokedAt: null
            }
        }),
        client_2.prisma.workspaceMember.count({
            where: { workspaceId: { in: workspaceIds } }
        }),
        client_2.prisma.$queryRaw `
            SELECT COUNT(*) AS "count"
            FROM "Invite"
            WHERE "workspaceId" IN (${client_1.Prisma.join(workspaceIds)})
              AND "status" = ${'PENDING'}
        `,
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
    const trackedLinkedOrganizationIds = new Set();
    for (const linkedOrg of linkedOrgRows) {
        if (linkedOrg.organizationId && linkedOrg.organizationId !== enterpriseId) {
            trackedLinkedOrganizationIds.add(linkedOrg.organizationId);
        }
    }
    if (Array.isArray(pendingRequests)) {
        for (const request of pendingRequests) {
            const organizationId = request.organizationId;
            if (organizationId && organizationId !== enterpriseId) {
                trackedLinkedOrganizationIds.add(organizationId);
            }
        }
    }
    const pendingInvitesCount = toNumber(pendingInviteRows?.[0]?.count, 0);
    return {
        enterpriseId,
        limits,
        usage: {
            workspaces: workspaceIds.length,
            linkedOrgs: trackedLinkedOrganizationIds.size,
            apiKeys: activeApiKeyCount,
            members: workspaceMemberCount + pendingInvitesCount
        },
        workspaceIds,
        trackedLinkedOrganizationIds
    };
};
exports.getEnterpriseQuotaSnapshotByOrganizationId = getEnterpriseQuotaSnapshotByOrganizationId;
const getEnterpriseQuotaSnapshotByWorkspaceId = async (workspaceId) => {
    const enterpriseId = await (0, exports.resolveEnterpriseOrganizationIdForWorkspace)(workspaceId);
    if (!enterpriseId)
        return null;
    return (0, exports.getEnterpriseQuotaSnapshotByOrganizationId)(enterpriseId);
};
exports.getEnterpriseQuotaSnapshotByWorkspaceId = getEnterpriseQuotaSnapshotByWorkspaceId;
const RESOURCE_LABELS = {
    WORKSPACES: 'Workspaces',
    LINKED_ORGS: 'Linked Organizations',
    API_KEYS: 'API Keys',
    MEMBERS: 'Members'
};
class EnterpriseLimitReachedError extends Error {
    constructor(resource, limit, current, message) {
        super(message || `Limit reached for ${RESOURCE_LABELS[resource]}`);
        this.name = 'EnterpriseLimitReachedError';
        this.resource = resource;
        this.limit = limit;
        this.current = current;
    }
}
exports.EnterpriseLimitReachedError = EnterpriseLimitReachedError;
const isEnterpriseLimitReachedError = (error) => {
    return error instanceof EnterpriseLimitReachedError;
};
exports.isEnterpriseLimitReachedError = isEnterpriseLimitReachedError;
const toEnterpriseLimitResponse = (error) => ({
    error: 'LIMIT_REACHED',
    resource: error.resource,
    limit: error.limit,
    current: error.current,
    message: error.message
});
exports.toEnterpriseLimitResponse = toEnterpriseLimitResponse;
const getLimitAndCurrent = (snapshot, resource) => {
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
const assertEnterpriseQuotaAvailable = (snapshot, resource, options = {}) => {
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
exports.assertEnterpriseQuotaAvailable = assertEnterpriseQuotaAvailable;
const assertEnterpriseQuotaByOrganizationId = async (enterpriseId, resource, options = {}) => {
    const snapshot = await (0, exports.getEnterpriseQuotaSnapshotByOrganizationId)(enterpriseId);
    (0, exports.assertEnterpriseQuotaAvailable)(snapshot, resource, options);
    return snapshot;
};
exports.assertEnterpriseQuotaByOrganizationId = assertEnterpriseQuotaByOrganizationId;
const assertEnterpriseQuotaByWorkspaceId = async (workspaceId, resource, options = {}) => {
    const snapshot = await (0, exports.getEnterpriseQuotaSnapshotByWorkspaceId)(workspaceId);
    if (!snapshot)
        return null;
    (0, exports.assertEnterpriseQuotaAvailable)(snapshot, resource, options);
    return snapshot;
};
exports.assertEnterpriseQuotaByWorkspaceId = assertEnterpriseQuotaByWorkspaceId;
