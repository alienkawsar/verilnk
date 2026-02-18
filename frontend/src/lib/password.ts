import { STRONG_PASSWORD_REGEX } from '@/lib/validation';

export type PasswordChecks = {
    length: boolean;
    upper: boolean;
    lower: boolean;
    number: boolean;
    special: boolean;
};

export const getPasswordChecks = (password: string): PasswordChecks => ({
    length: password.length >= 8,
    upper: /[A-Z]/.test(password),
    lower: /[a-z]/.test(password),
    number: /\d/.test(password),
    special: /[^A-Za-z0-9]/.test(password),
});

export const getPasswordStrengthScore = (checks: PasswordChecks): number => {
    const values = Object.values(checks);
    return values.filter(Boolean).length;
};

export const getPasswordStrengthLabel = (score: number): 'Weak' | 'Medium' | 'Strong' => {
    if (score <= 2) return 'Weak';
    if (score <= 4) return 'Medium';
    return 'Strong';
};

export const isStrongPassword = (password: string): boolean =>
    STRONG_PASSWORD_REGEX.test(password);
