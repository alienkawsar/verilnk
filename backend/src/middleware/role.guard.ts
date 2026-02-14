import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.middleware';

export const authorizeRole = (roles: string[]) => {
    return (req: AuthRequest, res: Response, next: NextFunction): void => {
        if (!req.user) {
            res.sendStatus(401);
            return;
        }

        if (roles.includes(req.user.role)) {
            next();
        } else {
            res.sendStatus(403);
        }
    };
};
