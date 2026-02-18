'use client';

import type { EnterpriseAccess } from '@/lib/enterprise-api';

export type WorkspaceSection =
    | 'overview'
    | 'analytics'
    | 'usage'
    | 'api-keys'
    | 'members'
    | 'organizations'
    | 'security';

export type WorkspaceRoleCanonical = 'OWNER' | 'ADMIN' | 'DEVELOPER' | 'ANALYST' | 'AUDITOR';

export type ShowToast = (message: string, type: 'success' | 'error') => void;

export interface WorkspaceSectionProps {
    workspaceId: string;
    workspace: any;
    userRole: string;
    enterpriseAccess: EnterpriseAccess | null;
    showToast: ShowToast;
}

export const normalizeWorkspaceRole = (role: string | null | undefined): WorkspaceRoleCanonical | null => {
    if (!role) return null;
    const value = role.toUpperCase();
    if (value === 'EDITOR') return 'DEVELOPER';
    if (value === 'VIEWER') return 'AUDITOR';
    if (value === 'OWNER' || value === 'ADMIN' || value === 'DEVELOPER' || value === 'ANALYST' || value === 'AUDITOR') {
        return value;
    }
    return null;
};

export const displayWorkspaceRole = (role: string | null | undefined): string => {
    return normalizeWorkspaceRole(role) || role || 'UNKNOWN';
};

export const navItemRoles: Record<WorkspaceSection, WorkspaceRoleCanonical[]> = {
    overview: ['OWNER', 'ADMIN', 'DEVELOPER', 'ANALYST', 'AUDITOR'],
    analytics: ['OWNER', 'ADMIN', 'ANALYST'],
    usage: ['OWNER', 'ADMIN', 'DEVELOPER'],
    'api-keys': ['OWNER', 'ADMIN', 'DEVELOPER'],
    members: ['OWNER', 'ADMIN'],
    organizations: ['OWNER', 'ADMIN'],
    security: ['OWNER', 'ADMIN', 'DEVELOPER', 'AUDITOR'],
};

export const canAccessSection = (role: string | null | undefined, section: WorkspaceSection): boolean => {
    const normalizedRole = normalizeWorkspaceRole(role);
    if (!normalizedRole) return false;
    return navItemRoles[section].includes(normalizedRole);
};

export const getAccessibleSections = (role: string | null | undefined): WorkspaceSection[] => {
    const normalizedRole = normalizeWorkspaceRole(role);
    if (!normalizedRole) return [];
    const sections = (Object.keys(navItemRoles) as WorkspaceSection[]).filter((section) =>
        navItemRoles[section].includes(normalizedRole)
    );
    // Overview should always be first for dashboard landing.
    const withoutOverview = sections.filter((section) => section !== 'overview');
    return ['overview', ...withoutOverview];
};
