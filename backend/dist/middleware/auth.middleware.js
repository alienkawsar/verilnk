"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authorizeRole = exports.authenticateUser = exports.authenticateAdmin = exports.authenticateAny = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const jwt_1 = require("../config/jwt");
const client_1 = require("../db/client");
const session_service_1 = require("../services/session.service");
const client_2 = require("@prisma/client");
const SAFE_PATHS = [
    '/api/auth/me',
    '/api/auth/org/me',
    '/api/auth/user/me',
    '/api/auth/logout',
    '/api/auth/refresh',
    '/api/auth/change-password'
];
const handleAdminToken = async (decoded, req, res, next) => {
    const now = new Date();
    if (decoded.jti) {
        const existing = await (0, session_service_1.getSessionByJti)(decoded.jti);
        if (existing) {
            if (existing.revokedAt || existing.expiresAt <= now) {
                return res.status(401).json({ message: 'Session expired. Please login again.' });
            }
            const lastSeenAt = existing.lastSeenAt?.getTime() || 0;
            if (now.getTime() - lastSeenAt > 5 * 60 * 1000) {
                await (0, session_service_1.touchSession)(decoded.jti);
            }
        }
        else if (decoded.exp && decoded.iat) {
            await (0, session_service_1.createSession)({
                jti: decoded.jti,
                actorType: client_2.SessionActorType.ADMIN,
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
const handleUserToken = async (decoded, req, res, next) => {
    const now = new Date();
    const user = await client_1.prisma.user.findUnique({ where: { id: decoded.id } });
    if (!user) {
        return res.status(401).json({ message: 'User not found' });
    }
    const tokenVersion = decoded.tokenVersion || 0;
    if (user.tokenVersion !== tokenVersion) {
        return res.status(401).json({ message: 'Session expired. Please login again.' });
    }
    if (decoded.jti) {
        const existing = await (0, session_service_1.getSessionByJti)(decoded.jti);
        if (existing) {
            if (existing.revokedAt || existing.expiresAt <= now) {
                return res.status(401).json({ message: 'Session expired. Please login again.' });
            }
            const lastSeenAt = existing.lastSeenAt?.getTime() || 0;
            if (now.getTime() - lastSeenAt > 5 * 60 * 1000) {
                await (0, session_service_1.touchSession)(decoded.jti);
            }
        }
        else if (decoded.exp && decoded.iat) {
            await (0, session_service_1.createSession)({
                jti: decoded.jti,
                actorType: client_2.SessionActorType.ORG,
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
const authenticateAny = async (req, res, next) => {
    const token = req.cookies.admin_token || req.cookies.token || req.headers.authorization?.split(' ')[1];
    if (!token) {
        return res.status(401).json({ message: 'Authentication required' });
    }
    try {
        const decoded = jsonwebtoken_1.default.verify(token, (0, jwt_1.getJwtSecret)());
        if (decoded.role) {
            return handleAdminToken(decoded, req, res, next);
        }
        return handleUserToken(decoded, req, res, next);
    }
    catch {
        return res.status(401).json({ message: 'Invalid or expired token' });
    }
};
exports.authenticateAny = authenticateAny;
const authenticateAdmin = async (req, res, next) => {
    const token = req.cookies.admin_token || req.headers.authorization?.split(' ')[1];
    if (!token) {
        return res.status(401).json({ message: 'Authentication required' });
    }
    try {
        const decoded = jsonwebtoken_1.default.verify(token, (0, jwt_1.getJwtSecret)());
        if (!decoded.role) {
            return res.status(403).json({ message: 'Forbidden: Admin authentication required' });
        }
        return handleAdminToken(decoded, req, res, next);
    }
    catch {
        return res.status(401).json({ message: 'Invalid or expired token' });
    }
};
exports.authenticateAdmin = authenticateAdmin;
const authenticateUser = async (req, res, next) => {
    const token = req.cookies.token || req.headers.authorization?.split(' ')[1];
    if (!token) {
        return res.status(401).json({ message: 'Authentication required' });
    }
    try {
        const decoded = jsonwebtoken_1.default.verify(token, (0, jwt_1.getJwtSecret)());
        if (decoded.role) {
            return res.status(403).json({ message: 'Forbidden: User authentication required' });
        }
        return handleUserToken(decoded, req, res, next);
    }
    catch {
        return res.status(401).json({ message: 'Invalid or expired token' });
    }
};
exports.authenticateUser = authenticateUser;
const authorizeRole = (roles) => {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({ message: 'Forbidden: Insufficient permissions' });
        }
        next();
    };
};
exports.authorizeRole = authorizeRole;
