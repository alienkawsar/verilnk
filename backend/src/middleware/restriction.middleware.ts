import { Request, Response, NextFunction } from 'express';
import { prisma } from '../db/client';
import { isOrganizationEffectivelyRestricted } from '../services/organization-visibility.service';

export const checkRestriction = async (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;

    // Skip for Admins or GET requests (Read-Only allowed)
    if (user && ['SUPER_ADMIN', 'MODERATOR', 'VERIFIER', 'ACCOUNTS'].includes(user.role)) {
        return next();
    }

    // Only block mutating methods
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        return next();
    }

    try {
        if (user.organizationId) {
            const restricted = await isOrganizationEffectivelyRestricted(user.organizationId);
            if (restricted) {
                return res.status(403).json({ code: 'ORG_RESTRICTED', message: 'Organization is restricted' });
            }
        } else {
            // Check individual user restriction (if loaded in user obj, otherwise fetch)
            // req.user usually has basic info. If restricted is added to token, we can use it.
            // Otherwise fetch. Ideally token or req.user (from auth middleware) has it.
            // If auth middleware fetches user, ensure it includes isRestricted.
            // Assuming auth middleware puts DB user object in req.user
            const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
            if (dbUser?.isRestricted) {
                return res.status(403).json({ message: 'Account restricted. Contact support.' });
            }
        }
        next();
    } catch (error) {
        console.error('Restriction check failed', error);
        res.status(500).json({ message: 'Server error check restriction' });
    }
};
