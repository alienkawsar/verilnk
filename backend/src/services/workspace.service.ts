/**
 * Workspace Service
 * 
 * Manages enterprise workspaces for multi-org management.
 * Handles workspace CRUD, member management, and org linking.
 */

import { prisma } from '../db/client';
import {
    Workspace,
    WorkspaceMember,
    WorkspaceOrganization,
    WorkspaceMemberRole,
    WorkspaceStatus,
    InviteStatus,
    PlanType,
    OrgStatus
} from '@prisma/client';
import {
    canCreateWorkspace,
    getWorkspaceEntitlements,
    hasActiveEnterprisePlan
} from './enterprise.entitlement';
import {
    assertEnterpriseQuotaByWorkspaceId,
    EnterpriseLimitReachedError
} from './enterprise-quota.service';
import crypto from 'crypto';

// ============================================
// Types
// ============================================

export interface CreateWorkspaceInput {
    name: string;
    ownerId: string;
}

export interface WorkspaceWithDetails extends Workspace {
    members: WorkspaceMember[];
    organizations: WorkspaceOrganization[];
    _count: {
        apiKeys: number;
    };
}

export interface WorkspaceSummary {
    id: string;
    name: string;
    status: WorkspaceStatus;
    memberCount: number;
    orgCount: number;
    apiKeyCount: number;
    role: WorkspaceMemberRole;
    createdAt: Date;
}

export interface WorkspaceInviteRecord {
    id: string;
    workspaceId: string;
    invitedEmail: string | null;
    invitedUserId: string | null;
    role: WorkspaceMemberRole;
    status: InviteStatus;
    expiresAt: Date;
    acceptedAt: Date | null;
    createdBy: string;
    workspace?: {
        id: string;
        name: string;
    };
    createdByUser?: {
        id: string;
        name: string | null;
        email: string;
    } | null;
    createdAt: Date;
}

export interface WorkspaceInviteTargetInput {
    invitedEmail?: string;
    invitedUserId?: string;
}

// ============================================
// Workspace CRUD
// ============================================

/**
 * Create a new workspace
 * @throws Error if user cannot create workspace (no enterprise plan)
 */
export const createWorkspace = async (input: CreateWorkspaceInput): Promise<Workspace> => {
    // Check if user can create workspace
    const canCreate = await canCreateWorkspace(input.ownerId);
    if (!canCreate.allowed) {
        if (
            canCreate.resource === 'WORKSPACES'
            && typeof canCreate.limit === 'number'
            && typeof canCreate.current === 'number'
        ) {
            throw new EnterpriseLimitReachedError(
                'WORKSPACES',
                canCreate.limit,
                canCreate.current
            );
        }
        throw new Error(canCreate.reason || 'Cannot create workspace');
    }

    // Create workspace with owner as first member
    const workspace = await prisma.workspace.create({
        data: {
            name: input.name,
            ownerId: input.ownerId,
            status: WorkspaceStatus.ACTIVE,
            members: {
                create: {
                    userId: input.ownerId,
                    role: WorkspaceMemberRole.OWNER
                }
            }
        }
    });

    // Auto-link the owner's organization
    if (canCreate.organizationId) {
        await prisma.workspaceOrganization.create({
            data: {
                workspaceId: workspace.id,
                organizationId: canCreate.organizationId,
                linkedBy: input.ownerId
            }
        });
    }

    return workspace;
};

/**
 * Get workspace by ID with full details
 */
export const getWorkspaceById = async (id: string): Promise<WorkspaceWithDetails | null> => {
    return prisma.workspace.findUnique({
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

/**
 * Get all workspaces for a user
 */
export const getUserWorkspaces = async (userId: string): Promise<WorkspaceSummary[]> => {
    const memberships = await prisma.workspaceMember.findMany({
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

/**
 * Update workspace
 */
export const updateWorkspace = async (
    id: string,
    data: { name?: string; status?: WorkspaceStatus }
): Promise<Workspace> => {
    return prisma.workspace.update({
        where: { id },
        data
    });
};

/**
 * Delete workspace (OWNER only)
 */
export const deleteWorkspace = async (id: string): Promise<void> => {
    await prisma.workspace.delete({ where: { id } });
};

// ============================================
// Member Management
// ============================================

/**
 * Add member to workspace
 */
export const addWorkspaceMember = async (
    workspaceId: string,
    userId: string,
    role: WorkspaceMemberRole,
    invitedBy: string
): Promise<WorkspaceMember> => {
    // Check limits
    const entitlements = await getWorkspaceEntitlements(workspaceId);
    if (!entitlements.hasAccess) {
        throw new Error('Enterprise plan required');
    }

    // Check if already a member
    const existing = await prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId, userId } }
    });
    if (existing) {
        throw new Error('User is already a member of this workspace');
    }

    const memberQuota = await assertEnterpriseQuotaByWorkspaceId(workspaceId, 'MEMBERS');
    if (!memberQuota) {
        throw new Error('Enterprise plan required');
    }

    return prisma.workspaceMember.create({
        data: {
            workspaceId,
            userId,
            role,
            invitedBy
        }
    });
};

/**
 * Update member role
 */
export const updateMemberRole = async (
    workspaceId: string,
    userId: string,
    newRole: WorkspaceMemberRole
): Promise<WorkspaceMember> => {
    // Cannot change owner role
    const member = await prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId, userId } }
    });

    if (!member) {
        throw new Error('Member not found');
    }

    if (member.role === WorkspaceMemberRole.OWNER) {
        throw new Error('Cannot change owner role. Use transfer ownership instead.');
    }

    return prisma.workspaceMember.update({
        where: { workspaceId_userId: { workspaceId, userId } },
        data: { role: newRole }
    });
};

/**
 * Update member role by workspace member id
 */
export const updateMemberRoleById = async (
    workspaceId: string,
    memberId: string,
    newRole: WorkspaceMemberRole
): Promise<{ member: WorkspaceMember; oldRole: WorkspaceMemberRole }> => {
    const member = await prisma.workspaceMember.findFirst({
        where: {
            id: memberId,
            workspaceId
        }
    });

    if (!member) {
        throw new Error('Member not found');
    }

    if (member.role === WorkspaceMemberRole.OWNER) {
        throw new Error('Cannot change owner role. Use transfer ownership instead.');
    }

    const updatedMember = await prisma.workspaceMember.update({
        where: { id: memberId },
        data: { role: newRole }
    });

    return {
        member: updatedMember,
        oldRole: member.role
    };
};

/**
 * Remove member from workspace
 */
export const removeMember = async (workspaceId: string, userId: string): Promise<void> => {
    const member = await prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId, userId } }
    });

    if (!member) {
        throw new Error('Member not found');
    }

    if (member.role === WorkspaceMemberRole.OWNER) {
        throw new Error('Cannot remove owner. Transfer ownership first.');
    }

    await prisma.workspaceMember.delete({
        where: { workspaceId_userId: { workspaceId, userId } }
    });
};

/**
 * Transfer workspace ownership
 */
export const transferOwnership = async (
    workspaceId: string,
    currentOwnerId: string,
    newOwnerId: string
): Promise<void> => {
    // Verify current owner
    const currentOwner = await prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId, userId: currentOwnerId } }
    });

    if (!currentOwner || currentOwner.role !== WorkspaceMemberRole.OWNER) {
        throw new Error('Only the owner can transfer ownership');
    }

    // Verify new owner is a member
    const newOwner = await prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId, userId: newOwnerId } }
    });

    if (!newOwner) {
        throw new Error('New owner must be a workspace member');
    }

    // Transfer
    await prisma.$transaction([
        prisma.workspaceMember.update({
            where: { workspaceId_userId: { workspaceId, userId: currentOwnerId } },
            data: { role: WorkspaceMemberRole.ADMIN }
        }),
        prisma.workspaceMember.update({
            where: { workspaceId_userId: { workspaceId, userId: newOwnerId } },
            data: { role: WorkspaceMemberRole.OWNER }
        }),
        prisma.workspace.update({
            where: { id: workspaceId },
            data: { ownerId: newOwnerId }
        })
    ]);
};

/**
 * Get workspace members
 */
export const getWorkspaceMembers = async (workspaceId: string): Promise<Array<{
    id: string;
    userId: string;
    role: WorkspaceMemberRole;
    joinedAt: Date;
    user?: {
        name: string;
        email: string;
        firstName: string;
        lastName: string;
    };
}>> => {
    const members = await prisma.workspaceMember.findMany({
        where: { workspaceId },
        orderBy: [
            { role: 'asc' }, // OWNER first
            { joinedAt: 'asc' }
        ]
    });

    // Get user details
    const userIds = members.map(m => m.userId);
    const users = await prisma.user.findMany({
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

// ============================================
// Invite Management
// ============================================

const hashInviteToken = (token: string): string => {
    return crypto.createHash('sha256').update(token).digest('hex');
};

const generateInviteToken = (): string => {
    return `inv_${crypto.randomBytes(32).toString('hex')}`;
};

const normalizeInviteRecord = (
    invite: {
        id: string;
        workspaceId: string;
        invitedEmail: string | null;
        invitedUserId: string | null;
        role: WorkspaceMemberRole;
        status: InviteStatus;
        expiresAt: Date;
        acceptedAt: Date | null;
        createdBy: string;
        createdAt: Date;
        workspace?: {
            id: string;
            name: string;
        } | null;
    },
    createdByUser?: {
        id: string;
        name: string | null;
        email: string;
    } | null
): WorkspaceInviteRecord => ({
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

export const createWorkspaceInvite = async (
    workspaceId: string,
    target: WorkspaceInviteTargetInput,
    role: WorkspaceMemberRole,
    createdBy: string,
    expiresInDays: number = 7
): Promise<{ invite: WorkspaceInviteRecord; token: string }> => {
    const hasEmail = typeof target.invitedEmail === 'string' && target.invitedEmail.trim().length > 0;
    const hasUserId = typeof target.invitedUserId === 'string' && target.invitedUserId.trim().length > 0;

    if ((hasEmail && hasUserId) || (!hasEmail && !hasUserId)) {
        throw new Error('Provide exactly one invite target: invitedEmail or invitedUserId');
    }

    let normalizedEmail: string | null = null;
    let invitedUser: { id: string; email: string } | null = null;

    if (hasEmail) {
        normalizedEmail = target.invitedEmail!.trim().toLowerCase();
        if (!normalizedEmail.includes('@')) {
            throw new Error('Valid email is required');
        }

        invitedUser = await prisma.user.findFirst({
            where: { email: normalizedEmail },
            select: { id: true, email: true }
        });

        if (!invitedUser) {
            throw new Error('User not found');
        }
    } else {
        invitedUser = await prisma.user.findUnique({
            where: { id: target.invitedUserId! },
            select: { id: true, email: true }
        });

        if (!invitedUser) {
            throw new Error('User not found');
        }
        normalizedEmail = invitedUser.email.trim().toLowerCase();
    }

    const existingMember = await prisma.workspaceMember.findUnique({
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

    const existingPendingInvite = await prisma.invite.findFirst({
        where: {
            workspaceId,
            status: InviteStatus.PENDING,
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

    const inviteQuota = await assertEnterpriseQuotaByWorkspaceId(workspaceId, 'MEMBERS');
    if (!inviteQuota) {
        throw new Error('Enterprise plan required');
    }

    const token = generateInviteToken();
    const tokenHash = hashInviteToken(token);
    const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);

    const invite = await prisma.invite.create({
        data: {
            workspaceId,
            invitedEmail: normalizedEmail,
            invitedUserId: invitedUser.id,
            role,
            tokenHash,
            status: InviteStatus.PENDING,
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

const assertInviteRecipient = (
    invite: {
        invitedUserId: string | null;
        invitedEmail: string | null;
    },
    user: { id: string; email: string }
) => {
    const normalizedUserEmail = user.email.trim().toLowerCase();
    if (invite.invitedUserId && invite.invitedUserId !== user.id) {
        throw new Error('Invite does not belong to this user');
    }
    if (invite.invitedEmail && invite.invitedEmail.trim().toLowerCase() !== normalizedUserEmail) {
        throw new Error('Invite does not belong to this user');
    }
};

export const acceptWorkspaceInvite = async (
    token: string,
    userId: string
): Promise<WorkspaceMember> => {
    if (!token || typeof token !== 'string') {
        throw new Error('Invite token is required');
    }

    const tokenHash = hashInviteToken(token);

    return prisma.$transaction(async (tx) => {
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

        if (invite.status !== InviteStatus.PENDING) {
            throw new Error('Invite is no longer active');
        }

        if (invite.expiresAt.getTime() < Date.now()) {
            await tx.invite.update({
                where: { id: invite.id },
                data: {
                    status: InviteStatus.EXPIRED
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
                status: InviteStatus.ACCEPTED,
                acceptedAt: new Date()
            }
        });

        return member;
    });
};

export const getWorkspaceInvites = async (
    workspaceId: string,
    status?: InviteStatus
): Promise<WorkspaceInviteRecord[]> => {
    await prisma.invite.updateMany({
        where: {
            workspaceId,
            status: InviteStatus.PENDING,
            expiresAt: { lt: new Date() }
        },
        data: {
            status: InviteStatus.EXPIRED
        }
    });

    const invites = await prisma.invite.findMany({
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
        ? await prisma.user.findMany({
            where: { id: { in: createdByIds } },
            select: { id: true, name: true, email: true }
        })
        : [];
    const createdByMap = new Map(users.map((user) => [user.id, user]));

    return invites.map((invite) => normalizeInviteRecord(invite, createdByMap.get(invite.createdBy) || null));
};

const updateWorkspaceInviteStatus = async (
    workspaceId: string,
    inviteId: string,
    status: 'REVOKED'
): Promise<void> => {
    const invite = await prisma.invite.findUnique({
        where: { id: inviteId },
        select: { id: true, workspaceId: true, status: true }
    });

    if (!invite || invite.workspaceId !== workspaceId) {
        throw new Error('Invite not found');
    }

    if (invite.status !== InviteStatus.PENDING) {
        throw new Error('Only pending invites can be canceled');
    }

    await prisma.invite.update({
        where: { id: inviteId },
        data: { status }
    });
};

export const revokeWorkspaceInvite = async (
    workspaceId: string,
    inviteId: string
): Promise<void> => {
    await updateWorkspaceInviteStatus(workspaceId, inviteId, InviteStatus.REVOKED);
};

export const cancelWorkspaceInvite = async (
    workspaceId: string,
    inviteId: string
): Promise<void> => {
    await updateWorkspaceInviteStatus(workspaceId, inviteId, InviteStatus.REVOKED);
};

export const listMyWorkspaceInvites = async (userId: string): Promise<WorkspaceInviteRecord[]> => {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true }
    });

    if (!user) {
        throw new Error('User not found');
    }

    const normalizedEmail = user.email.trim().toLowerCase();

    await prisma.invite.updateMany({
        where: {
            status: InviteStatus.PENDING,
            expiresAt: { lt: new Date() },
            OR: [
                { invitedUserId: user.id },
                { invitedEmail: normalizedEmail }
            ]
        },
        data: {
            status: InviteStatus.EXPIRED
        }
    });

    const invites = await prisma.invite.findMany({
        where: {
            status: InviteStatus.PENDING,
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
        ? await prisma.user.findMany({
            where: { id: { in: createdByIds } },
            select: { id: true, name: true, email: true }
        })
        : [];
    const createdByMap = new Map(users.map((creator) => [creator.id, creator]));

    return invites.map((invite) => normalizeInviteRecord(invite, createdByMap.get(invite.createdBy) || null));
};

export const acceptWorkspaceInviteById = async (
    inviteId: string,
    userId: string
): Promise<WorkspaceMember> => {
    return prisma.$transaction(async (tx) => {
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

        if (invite.status !== InviteStatus.PENDING) {
            throw new Error('Invite has already been processed');
        }

        if (invite.expiresAt.getTime() < Date.now()) {
            await tx.invite.update({
                where: { id: invite.id },
                data: { status: InviteStatus.EXPIRED }
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
                status: InviteStatus.ACCEPTED,
                acceptedAt: new Date()
            }
        });

        return member;
    });
};

export const declineWorkspaceInviteById = async (
    inviteId: string,
    userId: string
): Promise<void> => {
    await prisma.$transaction(async (tx) => {
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

        if (invite.status !== InviteStatus.PENDING) {
            throw new Error('Invite has already been processed');
        }

        if (invite.expiresAt.getTime() < Date.now()) {
            await tx.invite.update({
                where: { id: invite.id },
                data: { status: InviteStatus.EXPIRED }
            });
            throw new Error('Invite has expired');
        }

        await tx.invite.update({
            where: { id: invite.id },
            data: {
                status: InviteStatus.REVOKED
            }
        });
    });
};

export const searchOrganizationsForWorkspaceLink = async (
    workspaceId: string,
    query: string,
    limit: number = 20
): Promise<Array<{
    id: string;
    name: string;
    slug: string | null;
    planType: PlanType;
    status: OrgStatus;
}>> => {
    const linked = await prisma.workspaceOrganization.findMany({
        where: { workspaceId },
        select: { organizationId: true }
    });
    const linkedIds = linked.map((item) => item.organizationId);

    const trimmedQuery = query.trim();
    const where = {
        deletedAt: null,
        status: OrgStatus.APPROVED,
        id: { notIn: linkedIds },
        ...(trimmedQuery
            ? {
                OR: [
                    { name: { contains: trimmedQuery, mode: 'insensitive' as const } },
                    { slug: { contains: trimmedQuery, mode: 'insensitive' as const } },
                    { id: { equals: trimmedQuery } }
                ]
            }
            : {})
    };

    return prisma.organization.findMany({
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

// ============================================
// Organization Linking
// ============================================

/**
 * Link organization to workspace (atomic transaction)
 */
export const linkOrganization = async (
    workspaceId: string,
    organizationId: string,
    linkedBy: string
): Promise<WorkspaceOrganization> => {
    const entitlements = await getWorkspaceEntitlements(workspaceId);
    if (!entitlements.hasAccess) {
        throw new Error('Enterprise plan required');
    }
    const linkQuota = await assertEnterpriseQuotaByWorkspaceId(workspaceId, 'LINKED_ORGS', {
        linkedOrganizationId: organizationId
    });
    if (!linkQuota) {
        throw new Error('Enterprise plan required');
    }

    return prisma.$transaction(async (tx) => {
        // Verify organization exists and is approved
        const org = await tx.organization.findUnique({
            where: { id: organizationId }
        });

        if (!org) {
            throw new Error('Organization not found');
        }

        if (org.status !== OrgStatus.APPROVED) {
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

/**
 * Unlink organization from workspace (atomic transaction)
 */
export const unlinkOrganization = async (
    workspaceId: string,
    organizationId: string
): Promise<void> => {
    await prisma.$transaction(async (tx) => {
        // Check if this is the last enterprise org
        const linkedOrgs = await tx.workspaceOrganization.findMany({
            where: { workspaceId }
        });

        const orgIds = linkedOrgs.map(lo => lo.organizationId);
        const orgs = await tx.organization.findMany({
            where: { id: { in: orgIds } }
        });

        const enterpriseOrgs = orgs.filter(hasActiveEnterprisePlan);
        const isRemovingEnterprise = enterpriseOrgs.some(o => o.id === organizationId);

        if (isRemovingEnterprise && enterpriseOrgs.length === 1) {
            throw new Error('Cannot unlink the only enterprise organization. This would disable workspace access.');
        }

        await tx.workspaceOrganization.delete({
            where: { workspaceId_organizationId: { workspaceId, organizationId } }
        });
    });
};

/**
 * Get linked organizations for a workspace
 */
export const getLinkedOrganizations = async (workspaceId: string): Promise<Array<{
    id: string;
    organizationId: string;
    linkedAt: Date;
    organization: {
        id: string;
        name: string;
        slug: string | null;
        planType: PlanType;
        status: OrgStatus;
    };
}>> => {
    const links = await prisma.workspaceOrganization.findMany({
        where: { workspaceId },
        orderBy: { createdAt: 'asc' }
    });

    const orgIds = links.map(l => l.organizationId);
    const orgs = await prisma.organization.findMany({
        where: { id: { in: orgIds } },
        select: { id: true, name: true, slug: true, planType: true, status: true }
    });
    const orgMap = new Map(orgs.map(o => [o.id, o]));

    return links.map(l => ({
        id: l.id,
        organizationId: l.organizationId,
        linkedAt: l.createdAt,
        organization: orgMap.get(l.organizationId)!
    })).filter(l => l.organization);
};
