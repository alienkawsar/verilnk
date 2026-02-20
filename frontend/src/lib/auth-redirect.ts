export type RedirectUser = {
    role?: string | null;
    organizationId?: string | null;
    planType?: string | null;
    mustChangePassword?: boolean;
};

export const sanitizeReturnTo = (value: string | null | undefined): string | null => {
    if (!value) return null;
    const trimmed = value.trim();
    if (!trimmed.startsWith('/')) return null;
    if (trimmed.startsWith('//')) return null;
    if (trimmed.startsWith('/auth/change-password')) return null;
    return trimmed;
};

export const getDefaultPostLoginRoute = (user: RedirectUser): string => {
    if (user.role === 'ACCOUNTS') return '/admin/billing';
    if (user.role === 'SUPER_ADMIN') return '/admin/dashboard';
    if (user.role === 'MODERATOR' || user.role === 'VERIFIER') return '/admin/dashboard';
    if (user.organizationId && user.planType === 'ENTERPRISE') return '/enterprise';
    if (user.organizationId) return '/org/dashboard';
    return '/dashboard';
};

export const buildForcePasswordChangeRoute = (returnTo: string): string => {
    const safeReturn = sanitizeReturnTo(returnTo) || '/dashboard';
    return `/auth/change-password?returnTo=${encodeURIComponent(safeReturn)}`;
};

export const resolvePostLoginDestination = (
    user: RedirectUser,
    returnToCandidate?: string | null
): string => {
    const safeReturnTo = sanitizeReturnTo(returnToCandidate);
    const targetAfterAuth = safeReturnTo || getDefaultPostLoginRoute(user);

    if (user.mustChangePassword) {
        return buildForcePasswordChangeRoute(targetAfterAuth);
    }

    return targetAfterAuth;
};
