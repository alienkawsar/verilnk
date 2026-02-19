export const PASSWORD_POLICY = {
    minLength: 8,
    requireLower: true,
    requireUpper: true,
    requireNumber: true,
    requireSpecial: true,
} as const;

export const PASSWORD_POLICY_MESSAGE =
    'Password must be at least 8 characters and include uppercase, lowercase, number, and special character.';

export const PASSWORD_POLICY_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

export type PasswordCriteria = {
    minLen: boolean;
    lower: boolean;
    upper: boolean;
    number: boolean;
    special: boolean;
};

export type PasswordStrengthLabel = 'Weak' | 'Fair' | 'Good' | 'Strong';

export const checkPasswordCriteria = (password: string): PasswordCriteria => ({
    minLen: password.length >= PASSWORD_POLICY.minLength,
    lower: /[a-z]/.test(password),
    upper: /[A-Z]/.test(password),
    number: /\d/.test(password),
    special: /[^A-Za-z0-9]/.test(password),
});

export const getPasswordStrength = (password: string): { score: 0 | 1 | 2 | 3 | 4; label: PasswordStrengthLabel } => {
    const checks = checkPasswordCriteria(password);
    const passedCount = Object.values(checks).filter(Boolean).length;
    const score = Math.min(4, Math.round((passedCount / 5) * 4)) as 0 | 1 | 2 | 3 | 4;

    if (score <= 1) return { score, label: 'Weak' };
    if (score === 2) return { score, label: 'Fair' };
    if (score === 3) return { score, label: 'Good' };
    return { score, label: 'Strong' };
};

export const validatePassword = (
    password: string,
): { ok: boolean; message?: string; criteria: PasswordCriteria } => {
    const criteria = checkPasswordCriteria(password);
    const ok = Object.values(criteria).every(Boolean);

    if (ok) {
        return { ok: true, criteria };
    }

    return {
        ok: false,
        message: PASSWORD_POLICY_MESSAGE,
        criteria,
    };
};
