export const STRONG_PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
export const STRONG_PASSWORD_MESSAGE =
    'Password must be at least 8 characters and include uppercase, lowercase, number, and special character.';

export const isStrongPassword = (password: string): boolean => {
    return STRONG_PASSWORD_REGEX.test(password);
};

export const assertStrongPassword = (password: string): void => {
    if (!isStrongPassword(password)) {
        throw new Error(STRONG_PASSWORD_MESSAGE);
    }
};

export const generateStrongPassword = (): string => {
    // Ensures all required character classes are present.
    const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lower = 'abcdefghijklmnopqrstuvwxyz';
    const digits = '0123456789';
    const special = '!@#$%^&*()-_=+[]{};:,.?/|~';
    const all = upper + lower + digits + special;

    const pick = (pool: string) => pool[Math.floor(Math.random() * pool.length)];
    const base = [pick(upper), pick(lower), pick(digits), pick(special)];
    while (base.length < 12) {
        base.push(pick(all));
    }
    // Shuffle
    for (let i = base.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [base[i], base[j]] = [base[j], base[i]];
    }
    return base.join('');
};
