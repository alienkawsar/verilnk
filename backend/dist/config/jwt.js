"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getJwtSecret = exports.ensureJwtSecret = void 0;
const ensureJwtSecret = () => {
    if (!process.env.JWT_SECRET) {
        if (process.env.NODE_ENV === 'production') {
            throw new Error('JWT_SECRET is required in production');
        }
        // Dev-only warning to avoid hard failure during local setup
        console.warn('JWT_SECRET is not set. Using insecure dev fallback.');
    }
};
exports.ensureJwtSecret = ensureJwtSecret;
const getJwtSecret = () => {
    return process.env.JWT_SECRET || 'dev-secret';
};
exports.getJwtSecret = getJwtSecret;
