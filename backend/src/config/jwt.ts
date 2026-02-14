export const ensureJwtSecret = (): void => {
    if (!process.env.JWT_SECRET) {
        if (process.env.NODE_ENV === 'production') {
            throw new Error('JWT_SECRET is required in production');
        }
        // Dev-only warning to avoid hard failure during local setup
        console.warn('JWT_SECRET is not set. Using insecure dev fallback.');
    }
};

export const getJwtSecret = (): string => {
    return process.env.JWT_SECRET || 'dev-secret';
};
