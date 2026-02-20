"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const enterprise_quota_service_1 = require("../services/enterprise-quota.service");
const baseSnapshot = {
    enterpriseId: 'ent-1',
    limits: {
        maxWorkspaces: 2,
        maxLinkedOrgs: 3,
        maxApiKeys: 2,
        maxMembers: 5
    },
    usage: {
        workspaces: 2,
        linkedOrgs: 3,
        apiKeys: 1,
        members: 4
    },
    workspaceIds: ['ws-1', 'ws-2'],
    trackedLinkedOrganizationIds: new Set(['org-1', 'org-2', 'org-3'])
};
(0, vitest_1.describe)('enterprise quota guard', () => {
    (0, vitest_1.it)('throws LIMIT_REACHED when workspaces are at quota', () => {
        (0, vitest_1.expect)(() => (0, enterprise_quota_service_1.assertEnterpriseQuotaAvailable)(baseSnapshot, 'WORKSPACES')).toThrow(enterprise_quota_service_1.EnterpriseLimitReachedError);
    });
    (0, vitest_1.it)('allows linked org operation when target org is already tracked', () => {
        (0, vitest_1.expect)(() => (0, enterprise_quota_service_1.assertEnterpriseQuotaAvailable)(baseSnapshot, 'LINKED_ORGS', {
            linkedOrganizationId: 'org-2'
        })).not.toThrow();
    });
    (0, vitest_1.it)('throws when adding a new linked organization above quota', () => {
        (0, vitest_1.expect)(() => (0, enterprise_quota_service_1.assertEnterpriseQuotaAvailable)(baseSnapshot, 'LINKED_ORGS', {
            linkedOrganizationId: 'org-999'
        })).toThrow(enterprise_quota_service_1.EnterpriseLimitReachedError);
    });
});
