import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getJwtSecret } from '../config/jwt';

export interface AuthRequest extends Request {
    user?: any;
}

import { prisma } from '../db/client';
import { createSession, getSessionByJti, touchSession } from '../services/session.service';
import { SessionActorType } from '@prisma/client';

const SAFE_PATHS = [
    '/api/auth/me',
    '/api/auth/org/me',
    '/api/auth/user/me',
    '/api/auth/logout',
    '/api/auth/refresh',
    '/api/auth/change-password'
];

const handleAdminToken = async (decoded: any, req: AuthRequest, res: Response, next: NextFunction) => {
    const now = new Date();
    if (decoded.jti) {
        const existing = await getSessionByJti(decoded.jti);
        if (existing) {
            if (existing.revokedAt || existing.expiresAt <= now) {
                return res.status(401).json({ message: 'Session expired. Please login again.' });
            }
            const lastSeenAt = existing.lastSeenAt?.getTime() || 0;
            if (now.getTime() - lastSeenAt > 5 * 60 * 1000) {
                await touchSession(decoded.jti);
            }
        } else if (decoded.exp && decoded.iat) {
            await createSession({
                jti: decoded.jti,
                actorType: SessionActorType.ADMIN,
                actorId: decoded.id,
                role: decoded.role,
                issuedAt: new Date(decoded.iat * 1000),
                expiresAt: new Date(decoded.exp * 1000),
                ipAddress: req.ip,
                userAgent: req.headers['user-agent']
            });
        }
    }
    req.user = decoded;
    return next();
};

const handleUserToken = async (decoded: any, req: AuthRequest, res: Response, next: NextFunction) => {
    const now = new Date();
    const user = await prisma.user.findUnique({ where: { id: decoded.id } });

    if (!user) {
        return res.status(401).json({ message: 'User not found' });
    }

    const tokenVersion = decoded.tokenVersion || 0;
    if (user.tokenVersion !== tokenVersion) {
        return res.status(401).json({ message: 'Session expired. Please login again.' });
    }

    if (decoded.jti) {
        const existing = await getSessionByJti(decoded.jti);
        if (existing) {
            if (existing.revokedAt || existing.expiresAt <= now) {
                return res.status(401).json({ message: 'Session expired. Please login again.' });
            }
            const lastSeenAt = existing.lastSeenAt?.getTime() || 0;
            if (now.getTime() - lastSeenAt > 5 * 60 * 1000) {
                await touchSession(decoded.jti);
            }
        } else if (decoded.exp && decoded.iat) {
            await createSession({
                jti: decoded.jti,
                actorType: SessionActorType.ORG,
                actorId: user.id,
                organizationId: user.organizationId ?? null,
                issuedAt: new Date(decoded.iat * 1000),
                expiresAt: new Date(decoded.exp * 1000),
                ipAddress: req.ip,
                userAgent: req.headers['user-agent']
            });
        }
    }

    if (user.mustChangePassword) {
        const isSafe = SAFE_PATHS.some(path => req.originalUrl.includes(path));
        if (!isSafe && req.method !== 'OPTIONS') {
            return res.status(403).json({
                message: 'Password change required',
                code: 'PASSWORD_CHANGE_REQUIRED',
                mustChangePassword: true
            });
        }
    }

    req.user = { ...decoded, mustChangePassword: user.mustChangePassword };
    return next();
};

export const authenticateAny = async (req: AuthRequest, res: Response, next: NextFunction) => {
    const token = req.cookies.admin_token || req.cookies.token || req.headers.authorization?.split(' ')[1];
    if (!token) {
        return res.status(401).json({ message: 'Authentication required' });
    }
    try {
        const decoded = jwt.verify(token, getJwtSecret()) as any;
        if (decoded.role) {
            return handleAdminToken(decoded, req, res, next);
        }
        return handleUserToken(decoded, req, res, next);
    } catch {
        return res.status(401).json({ message: 'Invalid or expired token' });
    }
};

export const authenticateAdmin = async (req: AuthRequest, res: Response, next: NextFunction) => {
    const token = req.cookies.admin_token || req.headers.authorization?.split(' ')[1];
    if (!token) {
        return res.status(401).json({ message: 'Authentication required' });
    }
    try {
        const decoded = jwt.verify(token, getJwtSecret()) as any;
        if (!decoded.role) {
            return res.status(403).json({ message: 'Forbidden: Admin authentication required' });
        }
        return handleAdminToken(decoded, req, res, next);
    } catch {
        return res.status(401).json({ message: 'Invalid or expired token' });
    }
};

export const authenticateUser = async (req: AuthRequest, res: Response, next: NextFunction) => {
    const token = req.cookies.token || req.headers.authorization?.split(' ')[1];
    if (!token) {
        return res.status(401).json({ message: 'Authentication required' });
    }
    try {
        const decoded = jwt.verify(token, getJwtSecret()) as any;
        if (decoded.role) {
            return res.status(403).json({ message: 'Forbidden: User authentication required' });
        }
        return handleUserToken(decoded, req, res, next);
    } catch {
        return res.status(401).json({ message: 'Invalid or expired token' });
    }
};

export const authorizeRole = (roles: string[]) => {
    return (req: AuthRequest, res: Response, next: NextFunction) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({ message: 'Forbidden: Insufficient permissions' });
        }
        next();
    };
};
