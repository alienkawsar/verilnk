"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createEnterpriseOrganizationAndLink = exports.denyOrganizationLinkRequest = exports.approveOrganizationLinkRequest = exports.listOrganizationPendingLinkRequests = exports.cancelWorkspaceLinkRequest = exports.createWorkspaceLinkRequest = exports.listWorkspaceLinkRequests = void 0;
const client_1 = require("@prisma/client");
const client_2 = require("../db/client");
const organization_service_1 = require("./organization.service");
const enterprise_quota_service_1 = require("./enterprise-quota.service");
const LINK_REQUEST_STATUS = {
    PENDING: 'PENDING',
    PENDING_APPROVAL: 'PENDING_APPROVAL',
    APPROVED: 'APPROVED',
    DENIED: 'DENIED',
    CANCELED: 'CANCELED'
};
const LINK_REQUEST_INTENT = {
    LINK_EXISTING: 'LINK_EXISTING',
    CREATE_UNDER_ENTERPRISE: 'CREATE_UNDER_ENTERPRISE'
};
const ELIGIBLE_ORGANIZATION_WHERE = {
    deletedAt: null,
    status: client_1.OrgStatus.APPROVED,
    isRestricted: false
};
const getLinkRequestModel = () => {
    const model = client_2.prisma.enterpriseOrgLinkRequest;
    if (!model) {
        throw new Error('EnterpriseOrgLinkRequest model is unavailable. Run prisma generate after migration.');
    }
    return model;
};
const parseDomain = (input) => {
    const raw = input.trim().toLowerCase();
    if (!raw)
        return null;
    try {
        const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
        const url = new URL(withProtocol);
        const hostname = url.hostname.replace(/^www\./i, '');
        return hostname || null;
    }
    catch {
        return null;
    }
};
const ensureWorkspaceScopedToEnterprise = async (workspaceId, enterpriseId) => {
    const link = await client_2.prisma.workspaceOrganization.findUnique({
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
const dedupeOrganizations = (organizations) => {
    const seen = new Set();
    const deduped = [];
    for (const org of organizations) {
        if (seen.has(org.id))
            continue;
        seen.add(org.id);
        deduped.push(org);
    }
    return deduped;
};
const resolveOrganizationByIdentifier = async (identifier) => {
    const normalized = identifier.trim().toLowerCase();
    if (!normalized) {
        throw new Error('Organization identifier is required');
    }
    const candidates = [];
    if (normalized.includes('@')) {
        const byEmail = await client_2.prisma.organization.findFirst({
            where: {
                ...ELIGIBLE_ORGANIZATION_WHERE,
                email: normalized
            },
            select: { id: true, name: true, slug: true, email: true, website: true }
        });
        if (byEmail)
            candidates.push(byEmail);
    }
    const slugCandidate = normalized.replace(/^\/+|\/+$/g, '');
    if (/^[a-z0-9-]{2,}$/i.test(slugCandidate)) {
        const bySlug = await client_2.prisma.organization.findFirst({
            where: {
                ...ELIGIBLE_ORGANIZATION_WHERE,
                slug: slugCandidate
            },
            select: { id: true, name: true, slug: true, email: true, website: true }
        });
        if (bySlug)
            candidates.push(bySlug);
    }
    const domain = parseDomain(normalized);
    if (domain) {
        const domainCandidates = await client_2.prisma.organization.findMany({
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
    const exactSlug = uniqueCandidates.find((org) => org.slug && org.slug.toLowerCase() === slugCandidate);
    if (exactSlug)
        return exactSlug;
    const exactEmail = uniqueCandidates.find((org) => org.email.toLowerCase() === normalized);
    if (exactEmail)
        return exactEmail;
    throw new Error('Multiple organizations matched. Use exact organization email or slug.');
};
const resolveOrganizationById = async (organizationId) => {
    const normalized = organizationId.trim();
    if (!normalized) {
        throw new Error('Organization identifier is required');
    }
    const organization = await client_2.prisma.organization.findFirst({
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
const listWorkspaceLinkRequests = async (workspaceId, enterpriseId) => {
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
exports.listWorkspaceLinkRequests = listWorkspaceLinkRequests;
const createWorkspaceLinkRequest = async (input) => {
    const { workspaceId, enterpriseId, requestedByUserId, linkMethod, identifier, organizationId, message } = input;
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
    const existingLink = await client_2.prisma.workspaceOrganization.findUnique({
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
    await (0, enterprise_quota_service_1.assertEnterpriseQuotaByOrganizationId)(enterpriseId, 'LINKED_ORGS', {
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
exports.createWorkspaceLinkRequest = createWorkspaceLinkRequest;
const cancelWorkspaceLinkRequest = async (input) => {
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
exports.cancelWorkspaceLinkRequest = cancelWorkspaceLinkRequest;
const listOrganizationPendingLinkRequests = async (organizationId) => {
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
exports.listOrganizationPendingLinkRequests = listOrganizationPendingLinkRequests;
const approveOrganizationLinkRequest = async (input) => {
    return client_2.prisma.$transaction(async (tx) => {
        const linkRequestModel = tx.enterpriseOrgLinkRequest;
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
        await (0, enterprise_quota_service_1.assertEnterpriseQuotaByOrganizationId)(request.enterpriseId, 'LINKED_ORGS', {
            linkedOrganizationId: request.organizationId
        });
        const workspace = await tx.workspace.findUnique({
            where: { id: request.workspaceId },
            select: { id: true, status: true }
        });
        if (!workspace || workspace.status !== client_1.WorkspaceStatus.ACTIVE) {
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
        const link = existingLink ||
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
exports.approveOrganizationLinkRequest = approveOrganizationLinkRequest;
const denyOrganizationLinkRequest = async (input) => {
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
exports.denyOrganizationLinkRequest = denyOrganizationLinkRequest;
const createEnterpriseOrganizationAndLink = async (input) => {
    await ensureWorkspaceScopedToEnterprise(input.workspaceId, input.enterpriseId);
    const enterpriseOrg = await client_2.prisma.organization.findUnique({
        where: { id: input.enterpriseId },
        select: {
            id: true,
            planEndAt: true
        }
    });
    if (!enterpriseOrg) {
        throw new Error('Enterprise organization not found');
    }
    await (0, enterprise_quota_service_1.assertEnterpriseQuotaByOrganizationId)(input.enterpriseId, 'LINKED_ORGS');
    const signupResult = await (0, organization_service_1.signupOrganization)({
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
    const managedOrg = await client_2.prisma.organization.update({
        where: { id: signupResult.org.id },
        data: {
            planType: client_1.PlanType.BUSINESS,
            planStatus: client_1.PlanStatus.ACTIVE,
            supportTier: client_1.SupportTier.INSTANT,
            priority: client_1.OrgPriority.HIGH,
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
exports.createEnterpriseOrganizationAndLink = createEnterpriseOrganizationAndLink;
