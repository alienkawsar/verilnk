import {
    OrgPriority,
    OrgStatus,
    OrgType,
    PlanStatus,
    PlanType,
    SupportTier,
    WorkspaceStatus
} from '@prisma/client';
import { prisma } from '../db/client';
import { signupOrganization } from './organization.service';
import { assertEnterpriseQuotaByOrganizationId } from './enterprise-quota.service';

type SafeOrganization = {
    id: string;
    name: string;
    slug: string | null;
    email: string;
    website: string;
};

type WorkspaceLinkMethod = 'EMAIL' | 'DOMAIN' | 'SLUG' | 'ORG_ID';

type LinkRequestStatus = 'PENDING' | 'PENDING_APPROVAL' | 'APPROVED' | 'DENIED' | 'CANCELED';

const LINK_REQUEST_STATUS: Record<LinkRequestStatus, LinkRequestStatus> = {
    PENDING: 'PENDING',
    PENDING_APPROVAL: 'PENDING_APPROVAL',
    APPROVED: 'APPROVED',
    DENIED: 'DENIED',
    CANCELED: 'CANCELED'
};

const LINK_REQUEST_INTENT = {
    LINK_EXISTING: 'LINK_EXISTING',
    CREATE_UNDER_ENTERPRISE: 'CREATE_UNDER_ENTERPRISE'
} as const;

const ELIGIBLE_ORGANIZATION_WHERE = {
    deletedAt: null,
    status: OrgStatus.APPROVED,
    isRestricted: false
} as const;

const getLinkRequestModel = () => {
    const model = (prisma as any).enterpriseOrgLinkRequest;
    if (!model) {
        throw new Error(
            'EnterpriseOrgLinkRequest model is unavailable. Run prisma generate after migration.'
        );
    }
    return model;
};

type CreateEnterpriseOrganizationInput = {
    workspaceId: string;
    enterpriseId: string;
    createdByUserId: string;
    orgName: string;
    email: string;
    password: string;
    website: string;
    phone: string;
    address: string;
    countryId: string;
    stateId?: string | null;
    categoryId: string;
    about?: string;
    logo?: string;
    type: OrgType;
};

const parseDomain = (input: string): string | null => {
    const raw = input.trim().toLowerCase();
    if (!raw) return null;

    try {
        const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
        const url = new URL(withProtocol);
        const hostname = url.hostname.replace(/^www\./i, '');
        return hostname || null;
    } catch {
        return null;
    }
};

const ensureWorkspaceScopedToEnterprise = async (workspaceId: string, enterpriseId: string) => {
    const link = await prisma.workspaceOrganization.findUnique({
        where: {
            workspaceId_organizationId: {
                workspaceId,
                organizationId: enterpriseId
            }
        },
        select: { id: true }
    });

    if (!link) {
        throw new Error('Workspace is not scoped to your enterprise organization');
    }
};

const dedupeOrganizations = (organizations: SafeOrganization[]): SafeOrganization[] => {
    const seen = new Set<string>();
    const deduped: SafeOrganization[] = [];
    for (const org of organizations) {
        if (seen.has(org.id)) continue;
        seen.add(org.id);
        deduped.push(org);
    }
    return deduped;
};

const resolveOrganizationByIdentifier = async (identifier: string): Promise<SafeOrganization> => {
    const normalized = identifier.trim().toLowerCase();
    if (!normalized) {
        throw new Error('Organization identifier is required');
    }

    const candidates: SafeOrganization[] = [];

    if (normalized.includes('@')) {
        const byEmail = await prisma.organization.findFirst({
            where: {
                ...ELIGIBLE_ORGANIZATION_WHERE,
                email: normalized
            },
            select: { id: true, name: true, slug: true, email: true, website: true }
        });
        if (byEmail) candidates.push(byEmail);
    }

    const slugCandidate = normalized.replace(/^\/+|\/+$/g, '');
    if (/^[a-z0-9-]{2,}$/i.test(slugCandidate)) {
        const bySlug = await prisma.organization.findFirst({
            where: {
                ...ELIGIBLE_ORGANIZATION_WHERE,
                slug: slugCandidate
            },
            select: { id: true, name: true, slug: true, email: true, website: true }
        });
        if (bySlug) candidates.push(bySlug);
    }

    const domain = parseDomain(normalized);
    if (domain) {
        const domainCandidates = await prisma.organization.findMany({
            where: {
                ...ELIGIBLE_ORGANIZATION_WHERE,
                website: { contains: domain, mode: 'insensitive' }
            },
            select: { id: true, name: true, slug: true, email: true, website: true },
            take: 20
        });

        for (const org of domainCandidates) {
            const orgDomain = parseDomain(org.website);
            if (orgDomain && orgDomain === domain) {
                candidates.push(org);
            }
        }
    }

    const uniqueCandidates = dedupeOrganizations(candidates);
    if (uniqueCandidates.length === 0) {
        throw new Error('No eligible organization found for this identifier');
    }
    if (uniqueCandidates.length === 1) {
        return uniqueCandidates[0];
    }

    const exactSlug = uniqueCandidates.find(
        (org) => org.slug && org.slug.toLowerCase() === slugCandidate
    );
    if (exactSlug) return exactSlug;

    const exactEmail = uniqueCandidates.find((org) => org.email.toLowerCase() === normalized);
    if (exactEmail) return exactEmail;

    throw new Error('Multiple organizations matched. Use exact organization email or slug.');
};

const resolveOrganizationById = async (organizationId: string): Promise<SafeOrganization> => {
    const normalized = organizationId.trim();
    if (!normalized) {
        throw new Error('Organization identifier is required');
    }

    const organization = await prisma.organization.findFirst({
        where: {
            ...ELIGIBLE_ORGANIZATION_WHERE,
            id: normalized
        },
        select: { id: true, name: true, slug: true, email: true, website: true }
    });

    if (!organization) {
        throw new Error('No eligible organization found for this identifier');
    }

    return organization;
};

export const listWorkspaceLinkRequests = async (workspaceId: string, enterpriseId: string) => {
    const linkRequestModel = getLinkRequestModel();
    return linkRequestModel.findMany({
        where: {
            workspaceId,
            enterpriseId
        },
        orderBy: { createdAt: 'desc' },
        include: {
            organization: {
                select: { id: true, name: true, slug: true, website: true }
            },
            workspace: {
                select: { id: true, name: true, status: true }
            },
            enterprise: {
                select: { id: true, name: true, slug: true }
            }
        }
    });
};

export const createWorkspaceLinkRequest = async (input: {
    workspaceId: string;
    enterpriseId: string;
    requestedByUserId: string;
    linkMethod?: WorkspaceLinkMethod;
    identifier?: string;
    organizationId?: string;
    message?: string;
}) => {
    const {
        workspaceId,
        enterpriseId,
        requestedByUserId,
        linkMethod,
        identifier,
        organizationId,
        message
    } = input;

    await ensureWorkspaceScopedToEnterprise(workspaceId, enterpriseId);

    const normalizedIdentifier = identifier?.trim() || '';
    const normalizedOrganizationId = organizationId?.trim() || '';
    const isOrgIdMethod = linkMethod === 'ORG_ID';

    const organization = isOrgIdMethod
        ? await resolveOrganizationById(normalizedOrganizationId)
        : await resolveOrganizationByIdentifier(normalizedIdentifier);

    const requestIdentifier = isOrgIdMethod ? normalizedOrganizationId : normalizedIdentifier;
    if (organization.id === enterpriseId) {
        throw new Error('Enterprise organization is already linked');
    }

    const existingLink = await prisma.workspaceOrganization.findUnique({
        where: {
            workspaceId_organizationId: {
                workspaceId,
                organizationId: organization.id
            }
        },
        select: { id: true }
    });

    if (existingLink) {
        throw new Error('Organization is already linked to this workspace');
    }

    const linkRequestModel = getLinkRequestModel();
    const existingPending = await linkRequestModel.findFirst({
        where: {
            workspaceId,
            enterpriseId,
            organizationId: organization.id,
            status: LINK_REQUEST_STATUS.PENDING
        },
        orderBy: { createdAt: 'desc' }
    });

    if (existingPending) {
        return existingPending;
    }

    await assertEnterpriseQuotaByOrganizationId(enterpriseId, 'LINKED_ORGS', {
        linkedOrganizationId: organization.id
    });

    return linkRequestModel.create({
        data: {
            enterpriseId,
            workspaceId,
            organizationId: organization.id,
            requestedByUserId,
            requestIdentifier,
            message: message?.trim() || null,
            intentType: LINK_REQUEST_INTENT.LINK_EXISTING,
            status: LINK_REQUEST_STATUS.PENDING
        },
        include: {
            organization: {
                select: { id: true, name: true, slug: true, website: true }
            },
            workspace: {
                select: { id: true, name: true, status: true }
            },
            enterprise: {
                select: { id: true, name: true, slug: true }
            }
        }
    });
};

export const cancelWorkspaceLinkRequest = async (input: {
    requestId: string;
    enterpriseId: string;
    requestedByUserId: string;
}) => {
    const linkRequestModel = getLinkRequestModel();
    const request = await linkRequestModel.findFirst({
        where: {
            id: input.requestId,
            enterpriseId: input.enterpriseId,
            status: {
                in: [LINK_REQUEST_STATUS.PENDING, LINK_REQUEST_STATUS.PENDING_APPROVAL]
            }
        }
    });

    if (!request) {
        throw new Error('Pending link request not found');
    }

    return linkRequestModel.update({
        where: { id: request.id },
        data: {
            status: LINK_REQUEST_STATUS.CANCELED,
            canceledAt: new Date(),
            updatedAt: new Date()
        }
    });
};

export const listOrganizationPendingLinkRequests = async (organizationId: string) => {
    const linkRequestModel = getLinkRequestModel();
    return linkRequestModel.findMany({
        where: {
            organizationId,
            status: LINK_REQUEST_STATUS.PENDING
        },
        orderBy: { createdAt: 'desc' },
        include: {
            enterprise: {
                select: { id: true, name: true, slug: true, website: true }
            },
            workspace: {
                select: { id: true, name: true, status: true }
            }
        }
    });
};

export const approveOrganizationLinkRequest = async (input: {
    requestId: string;
    organizationId: string;
    decisionByOrgUserId: string;
}) => {
    return prisma.$transaction(async (tx) => {
        const linkRequestModel = (tx as any).enterpriseOrgLinkRequest;
        const request = await linkRequestModel.findFirst({
            where: {
                id: input.requestId,
                organizationId: input.organizationId
            }
        });

        if (!request) {
            throw new Error('Pending link request not found');
        }

        if (request.status !== LINK_REQUEST_STATUS.PENDING) {
            throw new Error('Link request already processed');
        }

        if (!request.workspaceId) {
            throw new Error('Request does not target a workspace');
        }

        await assertEnterpriseQuotaByOrganizationId(request.enterpriseId, 'LINKED_ORGS', {
            linkedOrganizationId: request.organizationId
        });

        const workspace = await tx.workspace.findUnique({
            where: { id: request.workspaceId },
            select: { id: true, status: true }
        });

        if (!workspace || workspace.status !== WorkspaceStatus.ACTIVE) {
            throw new Error('Workspace is unavailable');
        }

        const existingLink = await tx.workspaceOrganization.findUnique({
            where: {
                workspaceId_organizationId: {
                    workspaceId: request.workspaceId,
                    organizationId: request.organizationId
                }
            }
        });

        const link =
            existingLink ||
            (await tx.workspaceOrganization.create({
                data: {
                    workspaceId: request.workspaceId,
                    organizationId: request.organizationId,
                    linkedBy: request.requestedByUserId || input.decisionByOrgUserId
                }
            }));

        const updatedRequest = await linkRequestModel.update({
            where: { id: request.id },
            data: {
                status: LINK_REQUEST_STATUS.APPROVED,
                decidedAt: new Date(),
                decisionByOrgUserId: input.decisionByOrgUserId
            }
        });

        return { request: updatedRequest, link };
    });
};

export const denyOrganizationLinkRequest = async (input: {
    requestId: string;
    organizationId: string;
    decisionByOrgUserId: string;
}) => {
    const linkRequestModel = getLinkRequestModel();
    const request = await linkRequestModel.findFirst({
        where: {
            id: input.requestId,
            organizationId: input.organizationId,
            status: LINK_REQUEST_STATUS.PENDING
        }
    });

    if (!request) {
        throw new Error('Pending link request not found');
    }

    return linkRequestModel.update({
        where: { id: request.id },
        data: {
            status: LINK_REQUEST_STATUS.DENIED,
            decidedAt: new Date(),
            decisionByOrgUserId: input.decisionByOrgUserId
        }
    });
};

export const createEnterpriseOrganizationAndLink = async (
    input: CreateEnterpriseOrganizationInput
) => {
    await ensureWorkspaceScopedToEnterprise(input.workspaceId, input.enterpriseId);

    const enterpriseOrg = await prisma.organization.findUnique({
        where: { id: input.enterpriseId },
        select: {
            id: true,
            planEndAt: true
        }
    });

    if (!enterpriseOrg) {
        throw new Error('Enterprise organization not found');
    }

    await assertEnterpriseQuotaByOrganizationId(input.enterpriseId, 'LINKED_ORGS');

    const signupResult = await signupOrganization({
        email: input.email.trim().toLowerCase(),
        password: input.password.trim(),
        orgName: input.orgName.trim(),
        website: input.website.trim(),
        phone: input.phone.trim(),
        address: input.address.trim(),
        countryId: input.countryId,
        stateId: input.stateId || undefined,
        categoryId: input.categoryId,
        type: input.type,
        about: input.about?.trim() || undefined,
        logo: input.logo?.trim() || undefined
    });

    const managedOrg = await prisma.organization.update({
        where: { id: signupResult.org.id },
        data: {
            planType: PlanType.BUSINESS,
            planStatus: PlanStatus.ACTIVE,
            supportTier: SupportTier.INSTANT,
            priority: OrgPriority.HIGH,
            planEndAt: enterpriseOrg.planEndAt ?? null
        }
    });

    const linkRequestModel = getLinkRequestModel();
    const linkRequest = await linkRequestModel.create({
        data: {
            enterpriseId: input.enterpriseId,
            workspaceId: input.workspaceId,
            organizationId: signupResult.org.id,
            requestedByUserId: input.createdByUserId,
            requestIdentifier: input.email.trim().toLowerCase(),
            message: 'Created by enterprise workspace. Pending super admin approval.',
            intentType: LINK_REQUEST_INTENT.CREATE_UNDER_ENTERPRISE,
            status: LINK_REQUEST_STATUS.PENDING_APPROVAL
        },
        include: {
            organization: {
                select: { id: true, name: true, slug: true, website: true }
            },
            workspace: {
                select: { id: true, name: true, status: true }
            },
            enterprise: {
                select: { id: true, name: true, slug: true }
            }
        }
    });

    return {
        organization: managedOrg,
        site: signupResult.site,
        linkRequest
    };
};
