import { describe, expect, it } from 'vitest';
import { canPerformWorkspaceAction } from '../services/enterprise.entitlement';

describe('enterprise RBAC', () => {
    it('allows OWNER and ADMIN to manage invites and organization links', () => {
        expect(canPerformWorkspaceAction('OWNER', 'manage_members')).toBe(true);
        expect(canPerformWorkspaceAction('ADMIN', 'manage_members')).toBe(true);
        expect(canPerformWorkspaceAction('OWNER', 'link_org')).toBe(true);
        expect(canPerformWorkspaceAction('ADMIN', 'link_org')).toBe(true);
        expect(canPerformWorkspaceAction('OWNER', 'create_api_key')).toBe(true);
        expect(canPerformWorkspaceAction('ADMIN', 'create_api_key')).toBe(true);
    });

    it('denies VIEWER from invite/link/key operations', () => {
        expect(canPerformWorkspaceAction('VIEWER', 'manage_members')).toBe(false);
        expect(canPerformWorkspaceAction('VIEWER', 'link_org')).toBe(false);
        expect(canPerformWorkspaceAction('VIEWER', 'create_api_key')).toBe(false);
    });
});
