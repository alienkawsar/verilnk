import { Request, Response, NextFunction } from 'express';

export const requestTimeout = (timeoutMs: number) => {
    return (req: Request, res: Response, next: NextFunction) => {
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
