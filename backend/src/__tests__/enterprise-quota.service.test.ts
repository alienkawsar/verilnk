import { describe, expect, it } from 'vitest';
import {
    assertEnterpriseQuotaAvailable,
    EnterpriseLimitReachedError,
    type EnterpriseQuotaSnapshot
} from '../services/enterprise-quota.service';

const baseSnapshot: EnterpriseQuotaSnapshot = {
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

describe('enterprise quota guard', () => {
    it('throws LIMIT_REACHED when workspaces are at quota', () => {
        expect(() => assertEnterpriseQuotaAvailable(baseSnapshot, 'WORKSPACES')).toThrow(
            EnterpriseLimitReachedError
        );
    });

    it('allows linked org operation when target org is already tracked', () => {
        expect(() =>
            assertEnterpriseQuotaAvailable(baseSnapshot, 'LINKED_ORGS', {
                linkedOrganizationId: 'org-2'
            })
        ).not.toThrow();
    });

    it('throws when adding a new linked organization above quota', () => {
        expect(() =>
            assertEnterpriseQuotaAvailable(baseSnapshot, 'LINKED_ORGS', {
                linkedOrganizationId: 'org-999'
            })
        ).toThrow(EnterpriseLimitReachedError);
    });
});
