"use strict";
/**
 * Workspace Service
 *
 * Manages enterprise workspaces for multi-org management.
 * Handles workspace CRUD, member management, and org linking.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLinkedOrganizations = exports.unlinkOrganization = exports.linkOrganization = exports.searchOrganizationsForWorkspaceLink = exports.declineWorkspaceInviteById = exports.acceptWorkspaceInviteById = exports.listMyWorkspaceInvites = exports.cancelWorkspaceInvite = exports.revokeWorkspaceInvite = exports.getWorkspaceInvites = exports.acceptWorkspaceInvite = exports.createWorkspaceInvite = exports.getWorkspaceMembers = exports.transferOwnership = exports.removeMember = exports.updateMemberRole = exports.addWorkspaceMember = exports.deleteWorkspace = exports.updateWorkspace = exports.getUserWorkspaces = exports.getWorkspaceById = exports.createWorkspace = void 0;
const client_1 = require("../db/client");
const client_2 = require("@prisma/client");
const enterprise_entitlement_1 = require("./enterprise.entitlement");
const enterprise_quota_service_1 = require("./enterprise-quota.service");
const crypto_1 = __importDefault(require("crypto"));
// ============================================
// Workspace CRUD
// ============================================
/**
 * Create a new workspace
 * @throws Error if user cannot create workspace (no enterprise plan)
 */
const createWorkspace = async (input) => {
    // Check if user can create workspace
    const canCreate = await (0, enterprise_entitlement_1.canCreateWorkspace)(input.ownerId);
    if (!canCreate.allowed) {
        if (canCreate.resource === 'WORKSPACES'
            && typeof canCreate.limit === 'number'
            && typeof canCreate.current === 'number') {
            throw new enterprise_quota_service_1.EnterpriseLimitReachedError('WORKSPACES', canCreate.limit, canCreate.current);
        }
        throw new Error(canCreate.reason || 'Cannot create workspace');
    }
    // Create workspace with owner as first member
    const workspace = await client_1.prisma.workspace.create({
        data: {
            name: input.name,
            ownerId: input.ownerId,
            status: client_2.WorkspaceStatus.ACTIVE,
            members: {
                create: {
                    userId: input.ownerId,
                    role: client_2.WorkspaceMemberRole.OWNER
                }
            }
        }
    });
    // Auto-link the owner's organization
    if (canCreate.organizationId) {
        await client_1.prisma.workspaceOrganization.create({
            data: {
                workspaceId: workspace.id,
                organizationId: canCreate.organizationId,
                linkedBy: input.ownerId
            }
        });
    }
    return workspace;
};
exports.createWorkspace = createWorkspace;
/**
 * Get workspace by ID with full details
 */
const getWorkspaceById = async (id) => {
    return client_1.prisma.workspace.findUnique({
        where: { id },
        include: {
            members: true,
            organizations: true,
            _count: {
                select: { apiKeys: true }
            }
        }
    });
};
exports.getWorkspaceById = getWorkspaceById;
/**
 * Get all workspaces for a user
 */
const getUserWorkspaces = async (userId) => {
    const memberships = await client_1.prisma.workspaceMember.findMany({
        where: { userId },
        include: {
            workspace: {
                include: {
                    _count: {
                        select: {
                            members: true,
                            organizations: true,
                            apiKeys: true
                        }
                    }
                }
            }
        }
    });
    return memberships.map(m => ({
        id: m.workspace.id,
        name: m.workspace.name,
        status: m.workspace.status,
        memberCount: m.workspace._count.members,
        orgCount: m.workspace._count.organizations,
        apiKeyCount: m.workspace._count.apiKeys,
        role: m.role,
        createdAt: m.workspace.createdAt
    }));
};
exports.getUserWorkspaces = getUserWorkspaces;
/**
 * Update workspace
 */
const updateWorkspace = async (id, data) => {
    return client_1.prisma.workspace.update({
        where: { id },
        data
    });
};
exports.updateWorkspace = updateWorkspace;
/**
 * Delete workspace (OWNER only)
 */
const deleteWorkspace = async (id) => {
    await client_1.prisma.workspace.delete({ where: { id } });
};
exports.deleteWorkspace = deleteWorkspace;
// ============================================
// Member Management
// ============================================
/**
 * Add member to workspace
 */
const addWorkspaceMember = async (workspaceId, userId, role, invitedBy) => {
    // Check limits
    const entitlements = await (0, enterprise_entitlement_1.getWorkspaceEntitlements)(workspaceId);
    if (!entitlements.hasAccess) {
        throw new Error('Enterprise plan required');
    }
    // Check if already a member
    const existing = await client_1.prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId, userId } }
    });
    if (existing) {
        throw new Error('User is already a member of this workspace');
    }
    const memberQuota = await (0, enterprise_quota_service_1.assertEnterpriseQuotaByWorkspaceId)(workspaceId, 'MEMBERS');
    if (!memberQuota) {
        throw new Error('Enterprise plan required');
    }
    return client_1.prisma.workspaceMember.create({
        data: {
            workspaceId,
            userId,
            role,
            invitedBy
        }
    });
};
exports.addWorkspaceMember = addWorkspaceMember;
/**
 * Update member role
 */
const updateMemberRole = async (workspaceId, userId, newRole) => {
    // Cannot change owner role
    const member = await client_1.prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId, userId } }
    });
    if (!member) {
        throw new Error('Member not found');
    }
    if (member.role === client_2.WorkspaceMemberRole.OWNER) {
        throw new Error('Cannot change owner role. Use transfer ownership instead.');
    }
    return client_1.prisma.workspaceMember.update({
        where: { workspaceId_userId: { workspaceId, userId } },
        data: { role: newRole }
    });
};
exports.updateMemberRole = updateMemberRole;
/**
 * Remove member from workspace
 */
const removeMember = async (workspaceId, userId) => {
    const member = await client_1.prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId, userId } }
    });
    if (!member) {
        throw new Error('Member not found');
    }
    if (member.role === client_2.WorkspaceMemberRole.OWNER) {
        throw new Error('Cannot remove owner. Transfer ownership first.');
    }
    await client_1.prisma.workspaceMember.delete({
        where: { workspaceId_userId: { workspaceId, userId } }
    });
};
exports.removeMember = removeMember;
/**
 * Transfer workspace ownership
 */
const transferOwnership = async (workspaceId, currentOwnerId, newOwnerId) => {
    // Verify current owner
    const currentOwner = await client_1.prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId, userId: currentOwnerId } }
    });
    if (!currentOwner || currentOwner.role !== client_2.WorkspaceMemberRole.OWNER) {
        throw new Error('Only the owner can transfer ownership');
    }
    // Verify new owner is a member
    const newOwner = await client_1.prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId, userId: newOwnerId } }
    });
    if (!newOwner) {
        throw new Error('New owner must be a workspace member');
    }
    // Transfer
    await client_1.prisma.$transaction([
        client_1.prisma.workspaceMember.update({
            where: { workspaceId_userId: { workspaceId, userId: currentOwnerId } },
            data: { role: client_2.WorkspaceMemberRole.ADMIN }
        }),
        client_1.prisma.workspaceMember.update({
            where: { workspaceId_userId: { workspaceId, userId: newOwnerId } },
            data: { role: client_2.WorkspaceMemberRole.OWNER }
        }),
        client_1.prisma.workspace.update({
            where: { id: workspaceId },
            data: { ownerId: newOwnerId }
        })
    ]);
};
exports.transferOwnership = transferOwnership;
/**
 * Get workspace members
 */
const getWorkspaceMembers = async (workspaceId) => {
    const members = await client_1.prisma.workspaceMember.findMany({
        where: { workspaceId },
        orderBy: [
            { role: 'asc' }, // OWNER first
            { joinedAt: 'asc' }
        ]
    });
    // Get user details
    const userIds = members.map(m => m.userId);
    const users = await client_1.prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, email: true, firstName: true, lastName: true }
    });
    const userMap = new Map(users.map(u => [u.id, u]));
    return members.map(m => ({
        id: m.id,
        userId: m.userId,
        role: m.role,
        joinedAt: m.joinedAt,
        user: userMap.get(m.userId)
    }));
};
exports.getWorkspaceMembers = getWorkspaceMembers;
// ============================================
// Invite Management
// ============================================
const hashInviteToken = (token) => {
    return crypto_1.default.createHash('sha256').update(token).digest('hex');
};
const generateInviteToken = () => {
    return `inv_${crypto_1.default.randomBytes(32).toString('hex')}`;
};
const normalizeInviteRecord = (invite, createdByUser) => ({
    id: invite.id,
    workspaceId: invite.workspaceId,
    invitedEmail: invite.invitedEmail,
    invitedUserId: invite.invitedUserId,
    role: invite.role,
    status: invite.status,
    expiresAt: invite.expiresAt,
    acceptedAt: invite.acceptedAt,
    createdBy: invite.createdBy,
    createdAt: invite.createdAt,
    ...(invite.workspace ? { workspace: invite.workspace } : {}),
    createdByUser: createdByUser || null
});
const createWorkspaceInvite = async (workspaceId, target, role, createdBy, expiresInDays = 7) => {
    const hasEmail = typeof target.invitedEmail === 'string' && target.invitedEmail.trim().length > 0;
    const hasUserId = typeof target.invitedUserId === 'string' && target.invitedUserId.trim().length > 0;
    if ((hasEmail && hasUserId) || (!hasEmail && !hasUserId)) {
        throw new Error('Provide exactly one invite target: invitedEmail or invitedUserId');
    }
    let normalizedEmail = null;
    let invitedUser = null;
    if (hasEmail) {
        normalizedEmail = target.invitedEmail.trim().toLowerCase();
        if (!normalizedEmail.includes('@')) {
            throw new Error('Valid email is required');
        }
        invitedUser = await client_1.prisma.user.findFirst({
            where: { email: normalizedEmail },
            select: { id: true, email: true }
        });
        if (!invitedUser) {
            throw new Error('User not found');
        }
    }
    else {
        invitedUser = await client_1.prisma.user.findUnique({
            where: { id: target.invitedUserId },
            select: { id: true, email: true }
        });
        if (!invitedUser) {
            throw new Error('User not found');
        }
        normalizedEmail = invitedUser.email.trim().toLowerCase();
    }
    const existingMember = await client_1.prisma.workspaceMember.findUnique({
        where: {
            workspaceId_userId: {
                workspaceId,
                userId: invitedUser.id
            }
        },
        select: { id: true }
    });
    if (existingMember) {
        throw new Error('User already a member');
    }
    const existingPendingInvite = await client_1.prisma.invite.findFirst({
        where: {
            workspaceId,
            status: client_2.InviteStatus.PENDING,
            OR: [
                { invitedUserId: invitedUser.id },
                ...(normalizedEmail ? [{ invitedEmail: normalizedEmail }] : [])
            ]
        },
        select: { id: true }
    });
    if (existingPendingInvite) {
        throw new Error('Invite already pending');
    }
    const inviteQuota = await (0, enterprise_quota_service_1.assertEnterpriseQuotaByWorkspaceId)(workspaceId, 'MEMBERS');
    if (!inviteQuota) {
        throw new Error('Enterprise plan required');
    }
    const token = generateInviteToken();
    const tokenHash = hashInviteToken(token);
    const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);
    const invite = await client_1.prisma.invite.create({
        data: {
            workspaceId,
            invitedEmail: normalizedEmail,
            invitedUserId: invitedUser.id,
            role,
            tokenHash,
            status: client_2.InviteStatus.PENDING,
            expiresAt,
            createdBy
        },
        select: {
            id: true,
            workspaceId: true,
            invitedEmail: true,
            invitedUserId: true,
            role: true,
            status: true,
            expiresAt: true,
            acceptedAt: true,
            createdBy: true,
            createdAt: true
        }
    });
    return {
        invite: normalizeInviteRecord(invite),
        token
    };
};
exports.createWorkspaceInvite = createWorkspaceInvite;
const assertInviteRecipient = (invite, user) => {
    const normalizedUserEmail = user.email.trim().toLowerCase();
    if (invite.invitedUserId && invite.invitedUserId !== user.id) {
        throw new Error('Invite does not belong to this user');
    }
    if (invite.invitedEmail && invite.invitedEmail.trim().toLowerCase() !== normalizedUserEmail) {
        throw new Error('Invite does not belong to this user');
    }
};
const acceptWorkspaceInvite = async (token, userId) => {
    if (!token || typeof token !== 'string') {
        throw new Error('Invite token is required');
    }
    const tokenHash = hashInviteToken(token);
    return client_1.prisma.$transaction(async (tx) => {
        const invite = await tx.invite.findUnique({
            where: { tokenHash },
            select: {
                id: true,
                workspaceId: true,
                invitedEmail: true,
                invitedUserId: true,
                role: true,
                status: true,
                expiresAt: true,
                createdBy: true
            }
        });
        if (!invite) {
            throw new Error('Invalid invite token');
        }
        if (invite.status !== client_2.InviteStatus.PENDING) {
            throw new Error('Invite is no longer active');
        }
        if (invite.expiresAt.getTime() < Date.now()) {
            await tx.invite.update({
                where: { id: invite.id },
                data: {
                    status: client_2.InviteStatus.EXPIRED
                }
            });
            throw new Error('Invite has expired');
        }
        const user = await tx.user.findUnique({
            where: { id: userId },
            select: { id: true, email: true }
        });
        if (!user) {
            throw new Error('User not found');
        }
        assertInviteRecipient(invite, user);
        const existingMember = await tx.workspaceMember.findUnique({
            where: {
                workspaceId_userId: {
                    workspaceId: invite.workspaceId,
                    userId: user.id
                }
            },
            select: {
                id: true,
                workspaceId: true,
                userId: true,
                role: true,
                invitedBy: true,
                joinedAt: true,
                createdAt: true,
                updatedAt: true
            }
        });
        const member = existingMember || await tx.workspaceMember.create({
            data: {
                workspaceId: invite.workspaceId,
                userId: user.id,
                role: invite.role,
                invitedBy: invite.createdBy
            }
        });
        await tx.invite.update({
            where: { id: invite.id },
            data: {
                status: client_2.InviteStatus.ACCEPTED,
                acceptedAt: new Date()
            }
        });
        return member;
    });
};
exports.acceptWorkspaceInvite = acceptWorkspaceInvite;
const getWorkspaceInvites = async (workspaceId, status) => {
    await client_1.prisma.invite.updateMany({
        where: {
            workspaceId,
            status: client_2.InviteStatus.PENDING,
            expiresAt: { lt: new Date() }
        },
        data: {
            status: client_2.InviteStatus.EXPIRED
        }
    });
    const invites = await client_1.prisma.invite.findMany({
        where: {
            workspaceId,
            ...(status ? { status } : {})
        },
        orderBy: { createdAt: 'desc' },
        select: {
            id: true,
            workspaceId: true,
            invitedEmail: true,
            invitedUserId: true,
            role: true,
            status: true,
            expiresAt: true,
            acceptedAt: true,
            createdBy: true,
            createdAt: true
        }
    });
    const createdByIds = Array.from(new Set(invites.map((invite) => invite.createdBy)));
    const users = createdByIds.length
        ? await client_1.prisma.user.findMany({
            where: { id: { in: createdByIds } },
            select: { id: true, name: true, email: true }
        })
        : [];
    const createdByMap = new Map(users.map((user) => [user.id, user]));
    return invites.map((invite) => normalizeInviteRecord(invite, createdByMap.get(invite.createdBy) || null));
};
exports.getWorkspaceInvites = getWorkspaceInvites;
const updateWorkspaceInviteStatus = async (workspaceId, inviteId, status) => {
    const invite = await client_1.prisma.invite.findUnique({
        where: { id: inviteId },
        select: { id: true, workspaceId: true, status: true }
    });
    if (!invite || invite.workspaceId !== workspaceId) {
        throw new Error('Invite not found');
    }
    if (invite.status !== client_2.InviteStatus.PENDING) {
        throw new Error('Only pending invites can be canceled');
    }
    await client_1.prisma.invite.update({
        where: { id: inviteId },
        data: { status }
    });
};
const revokeWorkspaceInvite = async (workspaceId, inviteId) => {
    await updateWorkspaceInviteStatus(workspaceId, inviteId, client_2.InviteStatus.REVOKED);
};
exports.revokeWorkspaceInvite = revokeWorkspaceInvite;
const cancelWorkspaceInvite = async (workspaceId, inviteId) => {
    await updateWorkspaceInviteStatus(workspaceId, inviteId, client_2.InviteStatus.REVOKED);
};
exports.cancelWorkspaceInvite = cancelWorkspaceInvite;
const listMyWorkspaceInvites = async (userId) => {
    const user = await client_1.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true }
    });
    if (!user) {
        throw new Error('User not found');
    }
    const normalizedEmail = user.email.trim().toLowerCase();
    await client_1.prisma.invite.updateMany({
        where: {
            status: client_2.InviteStatus.PENDING,
            expiresAt: { lt: new Date() },
            OR: [
                { invitedUserId: user.id },
                { invitedEmail: normalizedEmail }
            ]
        },
        data: {
            status: client_2.InviteStatus.EXPIRED
        }
    });
    const invites = await client_1.prisma.invite.findMany({
        where: {
            status: client_2.InviteStatus.PENDING,
            OR: [
                { invitedUserId: user.id },
                { invitedEmail: normalizedEmail }
            ]
        },
        orderBy: { createdAt: 'desc' },
        select: {
            id: true,
            workspaceId: true,
            invitedEmail: true,
            invitedUserId: true,
            role: true,
            status: true,
            expiresAt: true,
            acceptedAt: true,
            createdBy: true,
            createdAt: true,
            workspace: {
                select: {
                    id: true,
                    name: true
                }
            }
        }
    });
    const createdByIds = Array.from(new Set(invites.map((invite) => invite.createdBy)));
    const users = createdByIds.length
        ? await client_1.prisma.user.findMany({
            where: { id: { in: createdByIds } },
            select: { id: true, name: true, email: true }
        })
        : [];
    const createdByMap = new Map(users.map((creator) => [creator.id, creator]));
    return invites.map((invite) => normalizeInviteRecord(invite, createdByMap.get(invite.createdBy) || null));
};
exports.listMyWorkspaceInvites = listMyWorkspaceInvites;
const acceptWorkspaceInviteById = async (inviteId, userId) => {
    return client_1.prisma.$transaction(async (tx) => {
        const user = await tx.user.findUnique({
            where: { id: userId },
            select: { id: true, email: true }
        });
        if (!user) {
            throw new Error('User not found');
        }
        const invite = await tx.invite.findUnique({
            where: { id: inviteId },
            select: {
                id: true,
                workspaceId: true,
                invitedEmail: true,
                invitedUserId: true,
                role: true,
                status: true,
                expiresAt: true,
                createdBy: true
            }
        });
        if (!invite) {
            throw new Error('Invite not found');
        }
        assertInviteRecipient(invite, user);
        if (invite.status !== client_2.InviteStatus.PENDING) {
            throw new Error('Invite has already been processed');
        }
        if (invite.expiresAt.getTime() < Date.now()) {
            await tx.invite.update({
                where: { id: invite.id },
                data: { status: client_2.InviteStatus.EXPIRED }
            });
            throw new Error('Invite has expired');
        }
        const existingMember = await tx.workspaceMember.findUnique({
            where: {
                workspaceId_userId: {
                    workspaceId: invite.workspaceId,
                    userId: user.id
                }
            },
            select: {
                id: true,
                workspaceId: true,
                userId: true,
                role: true,
                invitedBy: true,
                joinedAt: true,
                createdAt: true,
                updatedAt: true
            }
        });
        const member = existingMember || await tx.workspaceMember.create({
            data: {
                workspaceId: invite.workspaceId,
                userId: user.id,
                role: invite.role,
                invitedBy: invite.createdBy
            }
        });
        await tx.invite.update({
            where: { id: invite.id },
            data: {
                status: client_2.InviteStatus.ACCEPTED,
                acceptedAt: new Date()
            }
        });
        return member;
    });
};
exports.acceptWorkspaceInviteById = acceptWorkspaceInviteById;
const declineWorkspaceInviteById = async (inviteId, userId) => {
    await client_1.prisma.$transaction(async (tx) => {
        const user = await tx.user.findUnique({
            where: { id: userId },
            select: { id: true, email: true }
        });
        if (!user) {
            throw new Error('User not found');
        }
        const invite = await tx.invite.findUnique({
            where: { id: inviteId },
            select: {
                id: true,
                invitedEmail: true,
                invitedUserId: true,
                status: true,
                expiresAt: true
            }
        });
        if (!invite) {
            throw new Error('Invite not found');
        }
        assertInviteRecipient(invite, user);
        if (invite.status !== client_2.InviteStatus.PENDING) {
            throw new Error('Invite has already been processed');
        }
        if (invite.expiresAt.getTime() < Date.now()) {
            await tx.invite.update({
                where: { id: invite.id },
                data: { status: client_2.InviteStatus.EXPIRED }
            });
            throw new Error('Invite has expired');
        }
        await tx.invite.update({
            where: { id: invite.id },
            data: {
                status: client_2.InviteStatus.REVOKED
            }
        });
    });
};
exports.declineWorkspaceInviteById = declineWorkspaceInviteById;
const searchOrganizationsForWorkspaceLink = async (workspaceId, query, limit = 20) => {
    const linked = await client_1.prisma.workspaceOrganization.findMany({
        where: { workspaceId },
        select: { organizationId: true }
    });
    const linkedIds = linked.map((item) => item.organizationId);
    const trimmedQuery = query.trim();
    const where = {
        deletedAt: null,
        status: client_2.OrgStatus.APPROVED,
        id: { notIn: linkedIds },
        ...(trimmedQuery
            ? {
                OR: [
                    { name: { contains: trimmedQuery, mode: 'insensitive' } },
                    { slug: { contains: trimmedQuery, mode: 'insensitive' } },
                    { id: { equals: trimmedQuery } }
                ]
            }
            : {})
    };
    return client_1.prisma.organization.findMany({
        where,
        select: {
            id: true,
            name: true,
            slug: true,
            planType: true,
            status: true
        },
        orderBy: { name: 'asc' },
        take: Math.min(Math.max(limit, 1), 50)
    });
};
exports.searchOrganizationsForWorkspaceLink = searchOrganizationsForWorkspaceLink;
// ============================================
// Organization Linking
// ============================================
/**
 * Link organization to workspace (atomic transaction)
 */
const linkOrganization = async (workspaceId, organizationId, linkedBy) => {
    const entitlements = await (0, enterprise_entitlement_1.getWorkspaceEntitlements)(workspaceId);
    if (!entitlements.hasAccess) {
        throw new Error('Enterprise plan required');
    }
    const linkQuota = await (0, enterprise_quota_service_1.assertEnterpriseQuotaByWorkspaceId)(workspaceId, 'LINKED_ORGS', {
        linkedOrganizationId: organizationId
    });
    if (!linkQuota) {
        throw new Error('Enterprise plan required');
    }
    return client_1.prisma.$transaction(async (tx) => {
        // Verify organization exists and is approved
        const org = await tx.organization.findUnique({
            where: { id: organizationId }
        });
        if (!org) {
            throw new Error('Organization not found');
        }
        if (org.status !== client_2.OrgStatus.APPROVED) {
            throw new Error('Only approved organizations can be linked');
        }
        // Check if already linked
        const existing = await tx.workspaceOrganization.findUnique({
            where: { workspaceId_organizationId: { workspaceId, organizationId } }
        });
        if (existing) {
            throw new Error('Organization is already linked to this workspace');
        }
        return tx.workspaceOrganization.create({
            data: {
                workspaceId,
                organizationId,
                linkedBy
            }
        });
    });
};
exports.linkOrganization = linkOrganization;
/**
 * Unlink organization from workspace (atomic transaction)
 */
const unlinkOrganization = async (workspaceId, organizationId) => {
    await client_1.prisma.$transaction(async (tx) => {
        // Check if this is the last enterprise org
        const linkedOrgs = await tx.workspaceOrganization.findMany({
            where: { workspaceId }
        });
        const orgIds = linkedOrgs.map(lo => lo.organizationId);
        const orgs = await tx.organization.findMany({
            where: { id: { in: orgIds } }
        });
        const enterpriseOrgs = orgs.filter(enterprise_entitlement_1.hasActiveEnterprisePlan);
        const isRemovingEnterprise = enterpriseOrgs.some(o => o.id === organizationId);
        if (isRemovingEnterprise && enterpriseOrgs.length === 1) {
            throw new Error('Cannot unlink the only enterprise organization. This would disable workspace access.');
        }
        await tx.workspaceOrganization.delete({
            where: { workspaceId_organizationId: { workspaceId, organizationId } }
        });
    });
};
exports.unlinkOrganization = unlinkOrganization;
/**
 * Get linked organizations for a workspace
 */
const getLinkedOrganizations = async (workspaceId) => {
    const links = await client_1.prisma.workspaceOrganization.findMany({
        where: { workspaceId },
        orderBy: { createdAt: 'asc' }
    });
    const orgIds = links.map(l => l.organizationId);
    const orgs = await client_1.prisma.organization.findMany({
        where: { id: { in: orgIds } },
        select: { id: true, name: true, slug: true, planType: true, status: true }
    });
    const orgMap = new Map(orgs.map(o => [o.id, o]));
    return links.map(l => ({
        id: l.id,
        organizationId: l.organizationId,
        linkedAt: l.createdAt,
        organization: orgMap.get(l.organizationId)
    })).filter(l => l.organization);
};
exports.getLinkedOrganizations = getLinkedOrganizations;
