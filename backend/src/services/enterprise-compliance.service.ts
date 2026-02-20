import { PlanType } from '@prisma/client';
import { prisma } from '../db/client';

export type EnterpriseComplianceAction =
    | 'WORKSPACE_CREATE'
    | 'WORKSPACE_DELETE'
    | 'WORKSPACE_SUSPEND'
    | 'WORKSPACE_ARCHIVE'
    | 'WORKSPACE_RESTORE'
    | 'ORGANIZATION_LINK'
    | 'ORGANIZATION_UNLINK'
    | 'MEMBER_ROLE_CHANGE'
    | 'API_KEY_LIFECYCLE'
    | 'BILLING_CHANGE'
    | 'COMPLIANCE_POLICY_VIEW'
    | 'COMPLIANCE_POLICY_UPDATE'
    | 'COMPLIANCE_AUDIT_VIEW'
    | 'COMPLIANCE_AUDIT_EXPORT';

const WRITE_ACTIONS = new Set<EnterpriseComplianceAction>([
    'WORKSPACE_CREATE',
    'WORKSPACE_DELETE',
    'WORKSPACE_SUSPEND',
    'WORKSPACE_ARCHIVE',
    'WORKSPACE_RESTORE',
    'ORGANIZATION_LINK',
    'ORGANIZATION_UNLINK',
    'MEMBER_ROLE_CHANGE',
    'API_KEY_LIFECYCLE',
    'BILLING_CHANGE',
    'COMPLIANCE_POLICY_UPDATE'
]);

const ACTION_ROLE_MATRIX: Record<EnterpriseComplianceAction, string[]> = {
    WORKSPACE_CREATE: ['OWNER', 'ADMIN', 'SUPER_ADMIN'],
    WORKSPACE_DELETE: ['OWNER', 'ADMIN', 'SUPER_ADMIN'],
    WORKSPACE_SUSPEND: ['OWNER', 'ADMIN', 'SUPER_ADMIN'],
    WORKSPACE_ARCHIVE: ['OWNER', 'ADMIN', 'SUPER_ADMIN'],
    WORKSPACE_RESTORE: ['OWNER', 'ADMIN', 'SUPER_ADMIN'],
    ORGANIZATION_LINK: ['OWNER', 'ADMIN', 'SUPER_ADMIN'],
    ORGANIZATION_UNLINK: ['OWNER', 'ADMIN', 'SUPER_ADMIN'],
    MEMBER_ROLE_CHANGE: ['OWNER', 'ADMIN', 'SUPER_ADMIN'],
    API_KEY_LIFECYCLE: ['OWNER', 'ADMIN', 'SUPER_ADMIN'],
    BILLING_CHANGE: ['OWNER', 'ADMIN', 'SUPER_ADMIN'],
    COMPLIANCE_POLICY_VIEW: ['OWNER', 'ADMIN', 'DEVELOPER', 'ANALYST', 'AUDITOR', 'SUPER_ADMIN'],
    COMPLIANCE_POLICY_UPDATE: ['OWNER', 'SUPER_ADMIN'],
    COMPLIANCE_AUDIT_VIEW: ['OWNER', 'ADMIN', 'DEVELOPER', 'ANALYST', 'AUDITOR', 'SUPER_ADMIN'],
    COMPLIANCE_AUDIT_EXPORT: ['OWNER', 'ADMIN', 'AUDITOR', 'SUPER_ADMIN']
};

const normalizeActorRole = (role: string | null | undefined): string => {
    const normalized = String(role || '').trim().toUpperCase();
    if (!normalized) return 'UNKNOWN';
    if (normalized === 'EDITOR') return 'DEVELOPER';
    if (normalized === 'VIEWER') return 'AUDITOR';
    return normalized;
};

const assertEnterpriseExists = async (enterpriseId: string) => {
    const organization = await prisma.organization.findFirst({
        where: {
            id: enterpriseId,
            deletedAt: null,
            planType: PlanType.ENTERPRISE
        },
        select: { id: true }
    });

    if (!organization) {
        throw new Error('Enterprise organization not found');
    }
};

export class EnterpriseComplianceError extends Error {
    status: number;
    code: string;
    enterpriseId: string;
    action: EnterpriseComplianceAction;
    reason: string;

    constructor(params: {
        enterpriseId: string;
        action: EnterpriseComplianceAction;
        reason: string;
        message?: string;
        status?: number;
    }) {
        super(params.message || 'Enterprise compliance policy blocked this action');
        this.name = 'EnterpriseComplianceError';
        this.status = params.status || 403;
        this.code = 'ENTERPRISE_COMPLIANCE_VIOLATION';
        this.enterpriseId = params.enterpriseId;
        this.action = params.action;
        this.reason = params.reason;
    }
}

export const isEnterpriseComplianceError = (error: unknown): error is EnterpriseComplianceError => {
    return error instanceof EnterpriseComplianceError;
};

export const toEnterpriseComplianceErrorResponse = (error: EnterpriseComplianceError) => ({
    code: error.code,
    message: error.message,
    enterpriseId: error.enterpriseId,
    action: error.action,
    reason: error.reason
});

export const getEnterpriseCompliancePolicy = async (enterpriseId: string) => {
    await assertEnterpriseExists(enterpriseId);
    return prisma.enterpriseCompliancePolicy.upsert({
        where: { enterpriseId },
        update: {},
        create: {
            enterpriseId,
            logRetentionDays: 90,
            requireStrongPasswords: false
        }
    });
};

export const updateEnterpriseCompliancePolicy = async (
    enterpriseId: string,
    updates: {
        logRetentionDays?: number;
        requireStrongPasswords?: boolean;
    }
) => {
    await assertEnterpriseExists(enterpriseId);

    const data: {
        logRetentionDays?: number;
        requireStrongPasswords?: boolean;
    } = {};

    if (typeof updates.logRetentionDays === 'number') {
        if (!Number.isInteger(updates.logRetentionDays) || updates.logRetentionDays < 7 || updates.logRetentionDays > 3650) {
            throw new Error('logRetentionDays must be an integer between 7 and 3650');
        }
        data.logRetentionDays = updates.logRetentionDays;
    }

    if (typeof updates.requireStrongPasswords === 'boolean') {
        data.requireStrongPasswords = updates.requireStrongPasswords;
    }

    if (Object.keys(data).length === 0) {
        throw new Error('No policy fields provided');
    }

    return prisma.enterpriseCompliancePolicy.upsert({
        where: { enterpriseId },
        update: data,
        create: {
            enterpriseId,
            logRetentionDays: data.logRetentionDays ?? 90,
            requireStrongPasswords: data.requireStrongPasswords ?? false
        }
    });
};

export const assertEnterpriseCompliance = async (input: {
    enterpriseId: string;
    action: EnterpriseComplianceAction;
    actorRole: string | null | undefined;
}) => {
    const { enterpriseId, action } = input;
    const actorRole = normalizeActorRole(input.actorRole);
    const policy = await getEnterpriseCompliancePolicy(enterpriseId);

    const allowedRoles = ACTION_ROLE_MATRIX[action] || ['OWNER', 'ADMIN', 'SUPER_ADMIN'];
    if (!allowedRoles.includes(actorRole)) {
        throw new EnterpriseComplianceError({
            enterpriseId,
            action,
            reason: `Role ${actorRole} is not allowed to perform ${action}`
        });
    }

    if (policy.requireStrongPasswords && WRITE_ACTIONS.has(action) && actorRole === 'UNKNOWN') {
        throw new EnterpriseComplianceError({
            enterpriseId,
            action,
            reason: 'Actor role is required for protected write actions when strong password policy is enabled'
        });
    }

    return policy;
};
