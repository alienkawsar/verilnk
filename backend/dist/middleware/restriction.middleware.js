"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkRestriction = void 0;
const client_1 = require("../db/client");
const checkRestriction = async (req, res, next) => {
    const user = req.user;
    // Skip for Admins or GET requests (Read-Only allowed)
    if (user && ['SUPER_ADMIN', 'MODERATOR', 'VERIFIER'].includes(user.role)) {
        return next();
    }
    // Only block mutating methods
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        return next();
    }
    try {
        if (user.organizationId) {
            const org = await client_1.prisma.organization.findUnique({ where: { id: user.organizationId } });
            if (org?.isRestricted) {
                return res.status(403).json({ message: 'Account restricted. Contact support.' });
            }
        }
        else {
            // Check individual user restriction (if loaded in user obj, otherwise fetch)
            // req.user usually has basic info. If restricted is added to token, we can use it.
            // Otherwise fetch. Ideally token or req.user (from auth middleware) has it.
            // If auth middleware fetches user, ensure it includes isRestricted.
            // Assuming auth middleware puts DB user object in req.user
            const dbUser = await client_1.prisma.user.findUnique({ where: { id: user.id } });
            if (dbUser?.isRestricted) {
                return res.status(403).json({ message: 'Account restricted. Contact support.' });
            }
        }
        next();
    }
    catch (error) {
        console.error('Restriction check failed', error);
        res.status(500).json({ message: 'Server error check restriction' });
    }
};
exports.checkRestriction = checkRestriction;
