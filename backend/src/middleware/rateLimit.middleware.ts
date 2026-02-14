import rateLimit from 'express-rate-limit';

export const globalRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // Limit each IP to 1000 requests per windowMs
    message: 'Too many requests from this IP, please try again later',
    standardHeaders: true,
    legacyHeaders: false,
});

export const strictRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 50, // Limit each IP to 50 requests per windowMs
    message: 'Too many attempts from this IP, please try again later',
    standardHeaders: true,
    legacyHeaders: false,
});

export const searchRateLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 120, // burst-friendly but controlled
    message: 'Too many search requests. Please slow down.',
    standardHeaders: true,
    legacyHeaders: false,
});

export const uploadRateLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 40,
    message: 'Too many upload requests. Please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
});

export const voiceRateLimiter = rateLimit({
    windowMs: 10 * 60 * 1000, // 10 minutes
    max: 60,
    message: 'Too many voice requests. Please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
});
