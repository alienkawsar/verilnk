"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertEnterpriseCompliance = exports.updateEnterpriseCompliancePolicy = exports.getEnterpriseCompliancePolicy = exports.toEnterpriseComplianceErrorResponse = exports.isEnterpriseComplianceError = exports.EnterpriseComplianceError = void 0;
const client_1 = require("@prisma/client");
const client_2 = require("../db/client");
const WRITE_ACTIONS = new Set([
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
const ACTION_ROLE_MATRIX = {
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
const normalizeActorRole = (role) => {
    const normalized = String(role || '').trim().toUpperCase();
    if (!normalized)
        return 'UNKNOWN';
    if (normalized === 'EDITOR')
        return 'DEVELOPER';
    if (normalized === 'VIEWER')
        return 'AUDITOR';
    return normalized;
};
const assertEnterpriseExists = async (enterpriseId) => {
    const organization = await client_2.prisma.organization.findFirst({
        where: {
            id: enterpriseId,
            deletedAt: null,
            planType: client_1.PlanType.ENTERPRISE
        },
        select: { id: true }
    });
    if (!organization) {
        throw new Error('Enterprise organization not found');
    }
};
class EnterpriseComplianceError extends Error {
    constructor(params) {
        super(params.message || 'Enterprise compliance policy blocked this action');
        this.name = 'EnterpriseComplianceError';
        this.status = params.status || 403;
        this.code = 'ENTERPRISE_COMPLIANCE_VIOLATION';
        this.enterpriseId = params.enterpriseId;
        this.action = params.action;
        this.reason = params.reason;
    }
}
exports.EnterpriseComplianceError = EnterpriseComplianceError;
const isEnterpriseComplianceError = (error) => {
    return error instanceof EnterpriseComplianceError;
};
exports.isEnterpriseComplianceError = isEnterpriseComplianceError;
const toEnterpriseComplianceErrorResponse = (error) => ({
    code: error.code,
    message: error.message,
    enterpriseId: error.enterpriseId,
    action: error.action,
    reason: error.reason
});
exports.toEnterpriseComplianceErrorResponse = toEnterpriseComplianceErrorResponse;
const getEnterpriseCompliancePolicy = async (enterpriseId) => {
    await assertEnterpriseExists(enterpriseId);
    return client_2.prisma.enterpriseCompliancePolicy.upsert({
        where: { enterpriseId },
        update: {},
        create: {
            enterpriseId,
            logRetentionDays: 90,
            requireStrongPasswords: false
        }
    });
};
exports.getEnterpriseCompliancePolicy = getEnterpriseCompliancePolicy;
const updateEnterpriseCompliancePolicy = async (enterpriseId, updates) => {
    await assertEnterpriseExists(enterpriseId);
    const data = {};
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
    return client_2.prisma.enterpriseCompliancePolicy.upsert({
        where: { enterpriseId },
        update: data,
        create: {
            enterpriseId,
            logRetentionDays: data.logRetentionDays ?? 90,
            requireStrongPasswords: data.requireStrongPasswords ?? false
        }
    });
};
exports.updateEnterpriseCompliancePolicy = updateEnterpriseCompliancePolicy;
const assertEnterpriseCompliance = async (input) => {
    const { enterpriseId, action } = input;
    const actorRole = normalizeActorRole(input.actorRole);
    const policy = await (0, exports.getEnterpriseCompliancePolicy)(enterpriseId);
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
exports.assertEnterpriseCompliance = assertEnterpriseCompliance;
