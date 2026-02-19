import {
    checkPasswordCriteria,
    validatePassword
} from '@/lib/passwordPolicy';

export type PasswordChecks = {
    length: boolean;
    upper: boolean;
    lower: boolean;
    number: boolean;
    special: boolean;
};

export const getPasswordChecks = (password: string): PasswordChecks => {
    const checks = checkPasswordCriteria(password);
    return {
        length: checks.minLen,
        upper: checks.upper,
        lower: checks.lower,
        number: checks.number,
        special: checks.special,
    };
};

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
    validatePassword(password).ok;
