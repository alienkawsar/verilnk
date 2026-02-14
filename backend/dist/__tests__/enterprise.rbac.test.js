"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const enterprise_entitlement_1 = require("../services/enterprise.entitlement");
(0, vitest_1.describe)('enterprise RBAC', () => {
    (0, vitest_1.it)('allows OWNER and ADMIN to manage invites and organization links', () => {
        (0, vitest_1.expect)((0, enterprise_entitlement_1.canPerformWorkspaceAction)('OWNER', 'manage_members')).toBe(true);
        (0, vitest_1.expect)((0, enterprise_entitlement_1.canPerformWorkspaceAction)('ADMIN', 'manage_members')).toBe(true);
        (0, vitest_1.expect)((0, enterprise_entitlement_1.canPerformWorkspaceAction)('OWNER', 'link_org')).toBe(true);
        (0, vitest_1.expect)((0, enterprise_entitlement_1.canPerformWorkspaceAction)('ADMIN', 'link_org')).toBe(true);
        (0, vitest_1.expect)((0, enterprise_entitlement_1.canPerformWorkspaceAction)('OWNER', 'create_api_key')).toBe(true);
        (0, vitest_1.expect)((0, enterprise_entitlement_1.canPerformWorkspaceAction)('ADMIN', 'create_api_key')).toBe(true);
    });
    (0, vitest_1.it)('denies VIEWER from invite/link/key operations', () => {
        (0, vitest_1.expect)((0, enterprise_entitlement_1.canPerformWorkspaceAction)('VIEWER', 'manage_members')).toBe(false);
        (0, vitest_1.expect)((0, enterprise_entitlement_1.canPerformWorkspaceAction)('VIEWER', 'link_org')).toBe(false);
        (0, vitest_1.expect)((0, enterprise_entitlement_1.canPerformWorkspaceAction)('VIEWER', 'create_api_key')).toBe(false);
    });
});
