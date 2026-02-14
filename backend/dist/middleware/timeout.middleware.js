"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestTimeout = void 0;
const requestTimeout = (timeoutMs) => {
    return (req, res, next) => {
        if (req.path.includes('/api/realtime/stream')) {
            return next();
        }
        req.setTimeout(timeoutMs);
        res.setTimeout(timeoutMs);
        const timeoutHandle = setTimeout(() => {
            if (!res.headersSent) {
                res.status(504).json({ message: 'Request timeout. Please try again.' });
            }
        }, timeoutMs);
        res.on('finish', () => {
            clearTimeout(timeoutHandle);
        });
        next();
    };
};
exports.requestTimeout = requestTimeout;
