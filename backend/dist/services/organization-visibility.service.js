"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildVisibleSiteWhere = exports.isOrganizationEffectivelyRestricted = exports.getEffectivelyRestrictedOrganizationIds = exports.getEnterpriseManagedOrganizationIds = void 0;
const client_1 = require("@prisma/client");
const client_2 = require("../db/client");
const toUniqueArray = (values) => Array.from(new Set(values.filter(Boolean)));
const getRestrictedEnterpriseIds = async () => {
    const rows = await client_2.prisma.organization.findMany({
        where: {
            deletedAt: null,
            planType: client_1.PlanType.ENTERPRISE,
            isRestricted: true
        },
        select: { id: true }
    });
    return rows.map((row) => row.id);
};
const getWorkspaceManagedOrgIdsForEnterpriseIds = async (enterpriseIds) => {
    if (enterpriseIds.length === 0)
        return [];
    const enterpriseWorkspaceLinks = await client_2.prisma.workspaceOrganization.findMany({
        where: {
            organizationId: { in: enterpriseIds }
        },
        select: { workspaceId: true }
    });
    const workspaceIds = toUniqueArray(enterpriseWorkspaceLinks.map((row) => row.workspaceId));
    if (workspaceIds.length === 0)
        return [];
    const workspaceOrgLinks = await client_2.prisma.workspaceOrganization.findMany({
        where: {
            workspaceId: { in: workspaceIds }
        },
        select: { organizationId: true }
    });
    return toUniqueArray(workspaceOrgLinks.map((row) => row.organizationId));
};
const getLinkRequestManagedOrgIdsForEnterpriseIds = async (enterpriseIds) => {
    if (enterpriseIds.length === 0)
        return [];
    const linkRequestModel = client_2.prisma.enterpriseOrgLinkRequest;
    if (!linkRequestModel)
        return [];
    const rows = await linkRequestModel.findMany({
        where: {
            enterpriseId: { in: enterpriseIds },
            OR: [
                {
                    status: client_1.EnterpriseOrgLinkRequestStatus.APPROVED
                },
                {
                    intentType: client_1.EnterpriseOrgLinkIntentType.CREATE_UNDER_ENTERPRISE,
                    status: client_1.EnterpriseOrgLinkRequestStatus.PENDING_APPROVAL
                }
            ]
        },
        select: { organizationId: true }
    });
    return toUniqueArray(rows.map((row) => row.organizationId));
};
const getEnterpriseManagedOrganizationIds = async (enterpriseId) => {
    if (!enterpriseId)
        return [];
    const [workspaceManagedOrgIds, linkRequestManagedOrgIds] = await Promise.all([
        getWorkspaceManagedOrgIdsForEnterpriseIds([enterpriseId]),
        getLinkRequestManagedOrgIdsForEnterpriseIds([enterpriseId])
    ]);
    return toUniqueArray([enterpriseId, ...workspaceManagedOrgIds, ...linkRequestManagedOrgIds]);
};
exports.getEnterpriseManagedOrganizationIds = getEnterpriseManagedOrganizationIds;
const getEffectivelyRestrictedOrganizationIds = async () => {
    const restrictedEnterpriseIds = await getRestrictedEnterpriseIds();
    if (restrictedEnterpriseIds.length === 0)
        return [];
    const [workspaceManagedOrgIds, linkRequestManagedOrgIds] = await Promise.all([
        getWorkspaceManagedOrgIdsForEnterpriseIds(restrictedEnterpriseIds),
        getLinkRequestManagedOrgIdsForEnterpriseIds(restrictedEnterpriseIds)
    ]);
    return toUniqueArray([
        ...restrictedEnterpriseIds,
        ...workspaceManagedOrgIds,
        ...linkRequestManagedOrgIds
    ]);
};
exports.getEffectivelyRestrictedOrganizationIds = getEffectivelyRestrictedOrganizationIds;
const isOrganizationEffectivelyRestricted = async (organizationId) => {
    if (!organizationId)
        return false;
    const directRestriction = await client_2.prisma.organization.findUnique({
        where: { id: organizationId },
        select: { isRestricted: true }
    });
    if (directRestriction?.isRestricted)
        return true;
    const restrictedOrgIds = await (0, exports.getEffectivelyRestrictedOrganizationIds)();
    return restrictedOrgIds.includes(organizationId);
};
exports.isOrganizationEffectivelyRestricted = isOrganizationEffectivelyRestricted;
const buildVisibleSiteWhere = async (baseWhere = {}) => {
    const effectivelyRestrictedOrgIds = await (0, exports.getEffectivelyRestrictedOrganizationIds)();
    const organizationWhere = {
        deletedAt: null,
        status: client_1.OrgStatus.APPROVED,
        isRestricted: false
    };
    if (effectivelyRestrictedOrgIds.length > 0) {
        organizationWhere.id = { notIn: effectivelyRestrictedOrgIds };
    }
    return {
        AND: [
            { deletedAt: null },
            {
                OR: [
                    { organizationId: null },
                    { organization: organizationWhere }
                ]
            },
            baseWhere
        ]
    };
};
exports.buildVisibleSiteWhere = buildVisibleSiteWhere;
