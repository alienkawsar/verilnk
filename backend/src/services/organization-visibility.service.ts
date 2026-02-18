import {
    EnterpriseOrgLinkIntentType,
    EnterpriseOrgLinkRequestStatus,
    OrgStatus,
    PlanType,
    Prisma
} from '@prisma/client';
import { prisma } from '../db/client';

const toUniqueArray = (values: string[]): string[] => Array.from(new Set(values.filter(Boolean)));

const getRestrictedEnterpriseIds = async (): Promise<string[]> => {
    const rows = await prisma.organization.findMany({
        where: {
            deletedAt: null,
            planType: PlanType.ENTERPRISE,
            isRestricted: true
        },
        select: { id: true }
    });

    return rows.map((row) => row.id);
};

const getWorkspaceManagedOrgIdsForEnterpriseIds = async (enterpriseIds: string[]): Promise<string[]> => {
    if (enterpriseIds.length === 0) return [];

    const enterpriseWorkspaceLinks = await prisma.workspaceOrganization.findMany({
        where: {
            organizationId: { in: enterpriseIds }
        },
        select: { workspaceId: true }
    });
    const workspaceIds = toUniqueArray(enterpriseWorkspaceLinks.map((row) => row.workspaceId));
    if (workspaceIds.length === 0) return [];

    const workspaceOrgLinks = await prisma.workspaceOrganization.findMany({
        where: {
            workspaceId: { in: workspaceIds }
        },
        select: { organizationId: true }
    });

    return toUniqueArray(workspaceOrgLinks.map((row) => row.organizationId));
};

const getLinkRequestManagedOrgIdsForEnterpriseIds = async (enterpriseIds: string[]): Promise<string[]> => {
    if (enterpriseIds.length === 0) return [];

    const linkRequestModel = (prisma as any).enterpriseOrgLinkRequest;
    if (!linkRequestModel) return [];

    const rows = await linkRequestModel.findMany({
        where: {
            enterpriseId: { in: enterpriseIds },
            OR: [
                {
                    status: EnterpriseOrgLinkRequestStatus.APPROVED
                },
                {
                    intentType: EnterpriseOrgLinkIntentType.CREATE_UNDER_ENTERPRISE,
                    status: EnterpriseOrgLinkRequestStatus.PENDING_APPROVAL
                }
            ]
        },
        select: { organizationId: true }
    });

    return toUniqueArray(rows.map((row: { organizationId: string }) => row.organizationId));
};

export const getEnterpriseManagedOrganizationIds = async (enterpriseId: string): Promise<string[]> => {
    if (!enterpriseId) return [];

    const [workspaceManagedOrgIds, linkRequestManagedOrgIds] = await Promise.all([
        getWorkspaceManagedOrgIdsForEnterpriseIds([enterpriseId]),
        getLinkRequestManagedOrgIdsForEnterpriseIds([enterpriseId])
    ]);

    return toUniqueArray([enterpriseId, ...workspaceManagedOrgIds, ...linkRequestManagedOrgIds]);
};

export const getEffectivelyRestrictedOrganizationIds = async (): Promise<string[]> => {
    const restrictedEnterpriseIds = await getRestrictedEnterpriseIds();
    if (restrictedEnterpriseIds.length === 0) return [];

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

export const isOrganizationEffectivelyRestricted = async (organizationId: string): Promise<boolean> => {
    if (!organizationId) return false;

    const directRestriction = await prisma.organization.findUnique({
        where: { id: organizationId },
        select: { isRestricted: true }
    });
    if (directRestriction?.isRestricted) return true;

    const restrictedOrgIds = await getEffectivelyRestrictedOrganizationIds();
    return restrictedOrgIds.includes(organizationId);
};

export const buildVisibleSiteWhere = async (
    baseWhere: Prisma.SiteWhereInput = {}
): Promise<Prisma.SiteWhereInput> => {
    const effectivelyRestrictedOrgIds = await getEffectivelyRestrictedOrganizationIds();

    const organizationWhere: Prisma.OrganizationWhereInput = {
        deletedAt: null,
        status: OrgStatus.APPROVED,
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
