"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const crypto_1 = __importDefault(require("crypto"));
const client_1 = require("@prisma/client");
const session_service_1 = require("../services/session.service");
const zod_1 = require("zod");
const client_2 = require("../db/client");
const auth_middleware_1 = require("../middleware/auth.middleware");
const restriction_middleware_1 = require("../middleware/restriction.middleware");
const request_service_1 = require("../services/request.service");
const rateLimit_middleware_1 = require("../middleware/rateLimit.middleware");
const recaptcha_service_1 = require("../services/recaptcha.service");
const jwt_1 = require("../config/jwt");
const passwordPolicy_1 = require("../utils/passwordPolicy");
const auditService = __importStar(require("../services/audit.service"));
const router = express_1.default.Router();
const ADMIN_SESSION_HOURS = 8;
const ORG_SESSION_HOURS = 8;
const USER_SESSION_HOURS = 24;
const getSessionHours = (opts) => {
    if (opts.isAdmin)
        return ADMIN_SESSION_HOURS;
    if (opts.isOrg)
        return ORG_SESSION_HOURS;
    return USER_SESSION_HOURS;
};
const createJwtToken = (payload, expiresInHours) => {
    return jsonwebtoken_1.default.sign(payload, (0, jwt_1.getJwtSecret)(), { expiresIn: `${expiresInHours}h` });
};
const buildSessionResponse = (decoded) => ({
    session: {
        iat: decoded?.iat,
        exp: decoded?.exp,
        jti: decoded?.jti
    }
});
// Helper: fetch an org user's planType in a single lightweight query
const getOrgPlanType = async (userId) => {
    const row = await client_2.prisma.user.findUnique({
        where: { id: userId },
        select: { organization: { select: { planType: true } } }
    });
    return row?.organization?.planType ?? undefined;
};
const signupSchema = zod_1.z.object({
    firstName: zod_1.z.string().min(1, 'First name is required'),
    lastName: zod_1.z.string().min(1, 'Last name is required'),
    email: zod_1.z.string().email('Invalid email address'),
    password: zod_1.z.string().regex(passwordPolicy_1.STRONG_PASSWORD_REGEX, passwordPolicy_1.STRONG_PASSWORD_MESSAGE),
    country: zod_1.z.string().optional(),
    captchaToken: zod_1.z.string().optional(), // Make optional in z schema but enforced in logic if needed, or make required
    captchaAction: zod_1.z.string().optional(),
});
const loginSchema = zod_1.z.object({
    email: zod_1.z.string().email('Invalid email address'),
    password: zod_1.z.string().min(1, 'Password is required'),
    captchaToken: zod_1.z.string().optional(),
    captchaAction: zod_1.z.string().optional(),
});
// Signup
router.post('/signup', rateLimit_middleware_1.strictRateLimiter, async (req, res) => {
    try {
        const { firstName, lastName, email, password, country, captchaToken } = signupSchema.parse(req.body);
        // Verify Captcha
        if (captchaToken) {
            const isHuman = await (0, recaptcha_service_1.verifyCaptcha)(captchaToken, 'user_signup');
            if (!isHuman) {
                return res.status(400).json({ message: 'Invalid CAPTCHA' });
            }
        }
        else if (process.env.NODE_ENV === 'production') {
            // Enforce in production
            return res.status(400).json({ message: 'CAPTCHA required' });
        }
        const existingUser = await client_2.prisma.user.findUnique({ where: { email } });
        if (existingUser) {
            return res.status(400).json({ message: 'User already exists' });
        }
        const hashedPassword = await bcryptjs_1.default.hash(password, 10);
        const name = `${firstName} ${lastName}`;
        const user = await client_2.prisma.user.create({
            data: {
                firstName,
                lastName,
                name, // Combine for backward compatibility
                email,
                password: hashedPassword,
                country,
            },
        });
        const sessionHours = getSessionHours({ isOrg: false });
        const jti = crypto_1.default.randomUUID();
        const token = jsonwebtoken_1.default.sign({
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            tokenVersion: user.tokenVersion,
            jti
        }, (0, jwt_1.getJwtSecret)(), {
            expiresIn: `${sessionHours}h`,
        });
        res.cookie('admin_token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: sessionHours * 60 * 60 * 1000,
            sameSite: 'lax',
        });
        res.status(201).json({
            message: 'User created successfully',
            user: {
                id: user.id,
                firstName: user.firstName,
                lastName: user.lastName,
                name: user.name,
                email: user.email,
                country: user.country
            },
            ...buildSessionResponse(jsonwebtoken_1.default.decode(token))
        });
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return res.status(400).json({ errors: error.errors });
        }
        console.error(error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
// Login
router.post('/login', rateLimit_middleware_1.strictRateLimiter, async (req, res) => {
    try {
        const { email, password, captchaToken } = loginSchema.parse(req.body);
        // Verify Captcha or enforce
        if (captchaToken) {
            const isHuman = await (0, recaptcha_service_1.verifyCaptcha)(captchaToken, 'login');
            if (!isHuman)
                return res.status(400).json({ message: 'Invalid CAPTCHA' });
        }
        else if (process.env.NODE_ENV === 'production') {
            return res.status(400).json({ message: 'CAPTCHA required' });
        }
        const user = await client_2.prisma.user.findUnique({ where: { email } });
        if (!user) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }
        const isMatch = await bcryptjs_1.default.compare(password, user.password);
        if (!isMatch) {
            if (user.organizationId) {
                await (0, session_service_1.logSecurityEvent)({
                    actorType: client_1.SessionActorType.ORG,
                    actorId: user.id,
                    eventType: client_1.SecurityEventType.FAILED_LOGIN,
                    severity: client_1.SecurityEventSeverity.MEDIUM,
                    ipAddress: req.ip,
                    userAgent: req.headers['user-agent'],
                    metadata: { email }
                });
                const recentFailures = await (0, session_service_1.countRecentFailedLogins)(client_1.SessionActorType.ORG, user.id);
                if (recentFailures >= 5) {
                    await (0, session_service_1.logSecurityEvent)({
                        actorType: client_1.SessionActorType.ORG,
                        actorId: user.id,
                        eventType: client_1.SecurityEventType.FAILED_LOGIN_BURST,
                        severity: client_1.SecurityEventSeverity.HIGH,
                        ipAddress: req.ip,
                        userAgent: req.headers['user-agent'],
                        metadata: { count: recentFailures + 1 }
                    });
                }
            }
            return res.status(400).json({ message: 'Invalid credentials' });
        }
        const isOrg = Boolean(user.organizationId);
        const sessionHours = getSessionHours({ isOrg });
        const jti = crypto_1.default.randomUUID();
        const token = jsonwebtoken_1.default.sign({
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            tokenVersion: user.tokenVersion, // Add tokenVersion for invalidation
            jti
        }, (0, jwt_1.getJwtSecret)(), {
            expiresIn: `${sessionHours}h`,
        });
        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: sessionHours * 60 * 60 * 1000,
            sameSite: 'lax',
        });
        const decoded = jsonwebtoken_1.default.decode(token);
        if (decoded?.exp && decoded?.iat) {
            const issuedAt = new Date(decoded.iat * 1000);
            const expiresAt = new Date(decoded.exp * 1000);
            const session = await (0, session_service_1.createSession)({
                jti,
                actorType: client_1.SessionActorType.ORG,
                actorId: user.id,
                organizationId: user.organizationId ?? null,
                issuedAt,
                expiresAt,
                ipAddress: req.ip,
                userAgent: req.headers['user-agent']
            });
            if (isOrg) {
                // Suspicious login: new device or new IP
                const recent = await client_2.prisma.authSession.findFirst({
                    where: {
                        actorType: client_1.SessionActorType.ORG,
                        actorId: user.id,
                        revokedAt: null,
                        id: { not: session.id }
                    },
                    orderBy: { createdAt: 'desc' }
                });
                if (recent?.userAgent && recent.userAgent !== session.userAgent) {
                    await (0, session_service_1.logSecurityEvent)({
                        actorType: client_1.SessionActorType.ORG,
                        actorId: user.id,
                        eventType: client_1.SecurityEventType.NEW_DEVICE,
                        severity: client_1.SecurityEventSeverity.MEDIUM,
                        ipAddress: req.ip,
                        userAgent: req.headers['user-agent']
                    });
                }
                if (recent?.ipAddress && recent.ipAddress !== session.ipAddress) {
                    await (0, session_service_1.logSecurityEvent)({
                        actorType: client_1.SessionActorType.ORG,
                        actorId: user.id,
                        eventType: client_1.SecurityEventType.NEW_IP,
                        severity: client_1.SecurityEventSeverity.MEDIUM,
                        ipAddress: req.ip,
                        userAgent: req.headers['user-agent']
                    });
                }
                const activeCount = await client_2.prisma.authSession.count({
                    where: {
                        actorType: client_1.SessionActorType.ORG,
                        actorId: user.id,
                        revokedAt: null,
                        expiresAt: { gt: new Date() }
                    }
                });
                if (activeCount > 5) {
                    await (0, session_service_1.logSecurityEvent)({
                        actorType: client_1.SessionActorType.ORG,
                        actorId: user.id,
                        eventType: client_1.SecurityEventType.MULTI_SESSION,
                        severity: client_1.SecurityEventSeverity.MEDIUM,
                        ipAddress: req.ip,
                        userAgent: req.headers['user-agent'],
                        metadata: { activeCount }
                    });
                }
            }
        }
        const planType = user.organizationId ? await getOrgPlanType(user.id) : undefined;
        res.json({
            message: 'Login successful',
            user: {
                id: user.id,
                firstName: user.firstName,
                lastName: user.lastName,
                name: user.name,
                email: user.email,
                country: user.country,
                organizationId: user.organizationId,
                isRestricted: user.isRestricted,
                mustChangePassword: user.mustChangePassword,
                ...(planType && { planType })
            },
            ...buildSessionResponse(decoded)
        });
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return res.status(400).json({ errors: error.errors });
        }
        console.error(error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
// Google Auth (Internal/System)
router.post('/google', async (req, res) => {
    try {
        const { email, firstName, lastName, photoUrl } = req.body;
        if (!email)
            return res.status(400).json({ message: 'Email required' });
        let user = await client_2.prisma.user.findUnique({ where: { email } });
        if (!user) {
            // Create new user with random password
            const randomPassword = (0, passwordPolicy_1.generateStrongPassword)();
            const hashedPassword = await bcryptjs_1.default.hash(randomPassword, 10);
            const name = `${firstName} ${lastName}`;
            user = await client_2.prisma.user.create({
                data: {
                    firstName: firstName || 'Google',
                    lastName: lastName || 'User',
                    name: firstName && lastName ? name : 'Google User',
                    email,
                    password: hashedPassword,
                    // profileImage: photoUrl // If schema supports it
                    mustChangePassword: false
                }
            });
        }
        const sessionHours = getSessionHours({ isOrg: Boolean(user.organizationId) });
        const jti = crypto_1.default.randomUUID();
        const token = jsonwebtoken_1.default.sign({
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            tokenVersion: user.tokenVersion,
            jti
        }, (0, jwt_1.getJwtSecret)(), {
            expiresIn: `${sessionHours}h`,
        });
        // We don't set cookie here, we return it to the Next.js API route which sets it
        const planType = user.organizationId ? await getOrgPlanType(user.id) : undefined;
        res.json({
            message: 'Google login successful',
            token,
            user: {
                id: user.id,
                firstName: user.firstName,
                lastName: user.lastName,
                name: user.name,
                email: user.email,
                country: user.country,
                organizationId: user.organizationId,
                isRestricted: user.isRestricted,
                ...(planType && { planType })
            },
            ...buildSessionResponse(jsonwebtoken_1.default.decode(token))
        });
    }
    catch (error) {
        console.error('Google Auth Error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
// Admin Login
router.post('/admin/login', rateLimit_middleware_1.strictRateLimiter, async (req, res) => {
    try {
        const { email, password, captchaToken } = loginSchema.parse(req.body);
        // Verify Captcha
        if (captchaToken) {
            const isHuman = await (0, recaptcha_service_1.verifyCaptcha)(captchaToken, 'admin_login');
            if (!isHuman)
                return res.status(400).json({ message: 'Invalid CAPTCHA' });
        }
        // Note: Admin login might not strict enforce captcha in dev, or at all if not passed from frontend?
        // But plan said enforce. Assuming standard policy.
        const admin = await client_2.prisma.admin.findUnique({ where: { email } });
        if (!admin) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }
        if (!admin.isActive) {
            return res.status(403).json({ message: 'Admin account is deactivated' });
        }
        const isMatch = await bcryptjs_1.default.compare(password, admin.password);
        if (!isMatch) {
            await (0, session_service_1.logSecurityEvent)({
                actorType: client_1.SessionActorType.ADMIN,
                actorId: admin.id,
                eventType: client_1.SecurityEventType.FAILED_LOGIN,
                severity: client_1.SecurityEventSeverity.MEDIUM,
                ipAddress: req.ip,
                userAgent: req.headers['user-agent'],
                metadata: { email }
            });
            const recentFailures = await (0, session_service_1.countRecentFailedLogins)(client_1.SessionActorType.ADMIN, admin.id);
            if (recentFailures >= 5) {
                await (0, session_service_1.logSecurityEvent)({
                    actorType: client_1.SessionActorType.ADMIN,
                    actorId: admin.id,
                    eventType: client_1.SecurityEventType.FAILED_LOGIN_BURST,
                    severity: client_1.SecurityEventSeverity.HIGH,
                    ipAddress: req.ip,
                    userAgent: req.headers['user-agent'],
                    metadata: { count: recentFailures + 1 }
                });
            }
            return res.status(400).json({ message: 'Invalid credentials' });
        }
        const sessionHours = getSessionHours({ isAdmin: true });
        const jti = crypto_1.default.randomUUID();
        const token = jsonwebtoken_1.default.sign({
            id: admin.id,
            email: admin.email,
            role: admin.role,
            firstName: admin.firstName,
            lastName: admin.lastName,
            jti
        }, (0, jwt_1.getJwtSecret)(), {
            expiresIn: `${sessionHours}h`,
        });
        res.cookie('admin_token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: sessionHours * 60 * 60 * 1000,
            sameSite: 'lax',
        });
        const decoded = jsonwebtoken_1.default.decode(token);
        if (decoded?.exp && decoded?.iat) {
            const issuedAt = new Date(decoded.iat * 1000);
            const expiresAt = new Date(decoded.exp * 1000);
            const session = await (0, session_service_1.createSession)({
                jti,
                actorType: client_1.SessionActorType.ADMIN,
                actorId: admin.id,
                role: admin.role,
                issuedAt,
                expiresAt,
                ipAddress: req.ip,
                userAgent: req.headers['user-agent']
            });
            const recent = await client_2.prisma.authSession.findFirst({
                where: {
                    actorType: client_1.SessionActorType.ADMIN,
                    actorId: admin.id,
                    revokedAt: null,
                    id: { not: session.id }
                },
                orderBy: { createdAt: 'desc' }
            });
            if (recent?.userAgent && recent.userAgent !== session.userAgent) {
                await (0, session_service_1.logSecurityEvent)({
                    actorType: client_1.SessionActorType.ADMIN,
                    actorId: admin.id,
                    eventType: client_1.SecurityEventType.NEW_DEVICE,
                    severity: client_1.SecurityEventSeverity.MEDIUM,
                    ipAddress: req.ip,
                    userAgent: req.headers['user-agent']
                });
            }
            if (recent?.ipAddress && recent.ipAddress !== session.ipAddress) {
                await (0, session_service_1.logSecurityEvent)({
                    actorType: client_1.SessionActorType.ADMIN,
                    actorId: admin.id,
                    eventType: client_1.SecurityEventType.NEW_IP,
                    severity: client_1.SecurityEventSeverity.MEDIUM,
                    ipAddress: req.ip,
                    userAgent: req.headers['user-agent']
                });
            }
            const activeCount = await client_2.prisma.authSession.count({
                where: {
                    actorType: client_1.SessionActorType.ADMIN,
                    actorId: admin.id,
                    revokedAt: null,
                    expiresAt: { gt: new Date() }
                }
            });
            if (activeCount > 5) {
                await (0, session_service_1.logSecurityEvent)({
                    actorType: client_1.SessionActorType.ADMIN,
                    actorId: admin.id,
                    eventType: client_1.SecurityEventType.MULTI_SESSION,
                    severity: client_1.SecurityEventSeverity.MEDIUM,
                    ipAddress: req.ip,
                    userAgent: req.headers['user-agent'],
                    metadata: { activeCount }
                });
            }
        }
        res.json({
            message: 'Login successful',
            user: {
                id: admin.id,
                email: admin.email,
                role: admin.role,
                firstName: admin.firstName,
                lastName: admin.lastName
            },
            ...buildSessionResponse(decoded)
        });
        await auditService.logAction({
            adminId: admin.id,
            actorRole: admin.role,
            action: client_1.AuditActionType.LOGIN,
            entity: 'AdminAuth',
            targetId: admin.id,
            details: `${admin.role} admin login`,
            snapshot: {
                role: admin.role
            },
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
        });
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return res.status(400).json({ errors: error.errors });
        }
        console.error(error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
// Logout
router.post('/logout', async (req, res) => {
    const token = req.cookies.token || req.cookies.admin_token || req.headers.authorization?.split(' ')[1];
    if (token) {
        try {
            const decoded = jsonwebtoken_1.default.verify(token, (0, jwt_1.getJwtSecret)());
            if (decoded?.jti) {
                await (0, session_service_1.revokeSessionByJti)(decoded.jti);
            }
        }
        catch {
            // ignore invalid/expired tokens on logout
        }
    }
    res.clearCookie('token');
    res.clearCookie('admin_token');
    res.json({ message: 'Logout successful' });
});
// Refresh Session
router.post('/refresh', auth_middleware_1.authenticateAny, async (req, res) => {
    try {
        const decoded = req.user;
        const isAdmin = Boolean(decoded?.role);
        if (isAdmin) {
            const admin = await client_2.prisma.admin.findUnique({ where: { id: decoded.id } });
            if (!admin)
                return res.status(401).json({ message: 'Not authenticated' });
            const sessionHours = getSessionHours({ isAdmin: true });
            const jti = decoded.jti || crypto_1.default.randomUUID();
            const token = createJwtToken({
                id: admin.id,
                email: admin.email,
                role: admin.role,
                firstName: admin.firstName,
                lastName: admin.lastName,
                jti
            }, sessionHours);
            const decodedNew = jsonwebtoken_1.default.decode(token);
            const expAt = new Date(decodedNew.exp * 1000);
            const existing = await (0, session_service_1.getSessionByJti)(jti);
            if (existing) {
                await (0, session_service_1.updateSessionExpiry)(jti, expAt);
            }
            else {
                await (0, session_service_1.createSession)({
                    jti,
                    actorType: client_1.SessionActorType.ADMIN,
                    actorId: admin.id,
                    role: admin.role,
                    issuedAt: new Date(decodedNew.iat * 1000),
                    expiresAt: expAt,
                    ipAddress: req.ip,
                    userAgent: req.headers['user-agent']
                });
            }
            res.cookie('admin_token', token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                maxAge: sessionHours * 60 * 60 * 1000,
                sameSite: 'lax',
            });
            return res.json({ message: 'Session refreshed', ...buildSessionResponse(decodedNew) });
        }
        const user = await client_2.prisma.user.findUnique({ where: { id: decoded.id } });
        if (!user)
            return res.status(401).json({ message: 'Not authenticated' });
        const isOrg = Boolean(user.organizationId);
        const sessionHours = getSessionHours({ isOrg });
        const jti = decoded.jti || crypto_1.default.randomUUID();
        const token = createJwtToken({
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            tokenVersion: user.tokenVersion,
            jti
        }, sessionHours);
        const decodedNew = jsonwebtoken_1.default.decode(token);
        const expAt = new Date(decodedNew.exp * 1000);
        const existing = await (0, session_service_1.getSessionByJti)(jti);
        if (existing) {
            await (0, session_service_1.updateSessionExpiry)(jti, expAt);
        }
        else {
            await (0, session_service_1.createSession)({
                jti,
                actorType: client_1.SessionActorType.ORG,
                actorId: user.id,
                organizationId: user.organizationId ?? null,
                issuedAt: new Date(decodedNew.iat * 1000),
                expiresAt: expAt,
                ipAddress: req.ip,
                userAgent: req.headers['user-agent']
            });
        }
        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: sessionHours * 60 * 60 * 1000,
            sameSite: 'lax',
        });
        return res.json({ message: 'Session refreshed', ...buildSessionResponse(decodedNew) });
    }
    catch (error) {
        res.status(500).json({ message: error.message || 'Failed to refresh session' });
    }
});
// --- Separated Session Endpoints ---
// 1. Admin Me
// eslint-disable-next-line @typescript-eslint/no-explicit-any
router.get('/admin/me', auth_middleware_1.authenticateAdmin, async (req, res) => {
    try {
        const userId = req.user.id;
        const admin = await client_2.prisma.admin.findUnique({ where: { id: userId } });
        if (!admin)
            return res.status(401).json({ message: 'Admin not found' });
        return res.json({
            user: {
                id: admin.id,
                email: admin.email,
                role: admin.role,
                type: 'admin',
                firstName: admin.firstName,
                lastName: admin.lastName
            },
            ...buildSessionResponse(req.user)
        });
    }
    catch (error) {
        console.error('Error in /admin/me:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
// 2. Org Me
// eslint-disable-next-line @typescript-eslint/no-explicit-any
router.get('/org/me', auth_middleware_1.authenticateUser, async (req, res) => {
    try {
        const userId = req.user.id;
        const user = await client_2.prisma.user.findUnique({ where: { id: userId } });
        if (!user)
            return res.status(401).json({ message: 'User not found' });
        if (!user.organizationId)
            return res.status(401).json({ message: 'Not an organization account' });
        const planType = await getOrgPlanType(user.id);
        return res.json({
            user: {
                id: user.id,
                email: user.email,
                country: user.country,
                type: 'user',
                firstName: user.firstName,
                lastName: user.lastName,
                organizationId: user.organizationId,
                name: user.name,
                isRestricted: user.isRestricted,
                mustChangePassword: user.mustChangePassword,
                ...(planType && { planType }),
                ...(await (0, request_service_1.getUserRequestUsage)(user.id))
            },
            ...buildSessionResponse(req.user)
        });
    }
    catch (error) {
        console.error('Error in /org/me:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
// 3. User Me
// eslint-disable-next-line @typescript-eslint/no-explicit-any
router.get('/user/me', auth_middleware_1.authenticateUser, async (req, res) => {
    try {
        const userId = req.user.id;
        const user = await client_2.prisma.user.findUnique({ where: { id: userId } });
        if (!user)
            return res.status(401).json({ message: 'User not found' });
        // NOTE: We do NOT exclude org users here necessarily, as org users are also users.
        // But if the prompt desires strict preference, frontend will call org/me first.
        const userPlanType = user.organizationId ? await getOrgPlanType(user.id) : undefined;
        return res.json({
            user: {
                id: user.id,
                email: user.email,
                country: user.country,
                type: 'user',
                firstName: user.firstName,
                lastName: user.lastName,
                organizationId: user.organizationId,
                name: user.name,
                isRestricted: user.isRestricted,
                dailyRequestLimit: user.dailyRequestLimit,
                requestLimit: user.requestLimit,
                requestLimitWindow: user.requestLimitWindow,
                mustChangePassword: user.mustChangePassword,
                ...(userPlanType && { planType: userPlanType }),
                ...(await (0, request_service_1.getUserRequestUsage)(user.id))
            },
            ...buildSessionResponse(req.user)
        });
    }
    catch (error) {
        console.error('Error in /user/me:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
// Legacy /me (kept for backward compatibility if needed, but Frontend will switch away)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
router.get('/me', auth_middleware_1.authenticateAny, async (req, res) => {
    try {
        const userId = req.user.id;
        // 1. Try to find as Admin first
        const admin = await client_2.prisma.admin.findUnique({ where: { id: userId } });
        if (admin) {
            return res.json({
                user: {
                    id: admin.id,
                    email: admin.email,
                    role: admin.role,
                    type: 'admin',
                    firstName: admin.firstName,
                    lastName: admin.lastName
                },
                ...buildSessionResponse(req.user)
            });
        }
        // 2. Try to find as Regular User
        const user = await client_2.prisma.user.findUnique({ where: { id: userId } });
        if (user) {
            const legacyPlanType = user.organizationId ? await getOrgPlanType(user.id) : undefined;
            return res.json({
                user: {
                    id: user.id,
                    email: user.email,
                    country: user.country,
                    type: 'user',
                    firstName: user.firstName,
                    lastName: user.lastName,
                    organizationId: user.organizationId,
                    name: user.name,
                    isRestricted: user.isRestricted,
                    dailyRequestLimit: user.dailyRequestLimit,
                    requestLimit: user.requestLimit,
                    requestLimitWindow: user.requestLimitWindow,
                    mustChangePassword: user.mustChangePassword,
                    ...(legacyPlanType && { planType: legacyPlanType }),
                    ...(await (0, request_service_1.getUserRequestUsage)(user.id))
                },
                ...buildSessionResponse(req.user)
            });
        }
        return res.status(404).json({ message: 'User not found' });
    }
    catch (error) {
        console.error('Error in /me:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
const updateProfileSchema = zod_1.z.object({
    firstName: zod_1.z.string().min(1, 'First name is required').optional(),
    lastName: zod_1.z.string().min(1, 'Last name is required').optional(),
    email: zod_1.z.string().email('Invalid email address').optional(),
    password: zod_1.z.string().regex(passwordPolicy_1.STRONG_PASSWORD_REGEX, passwordPolicy_1.STRONG_PASSWORD_MESSAGE).optional().or(zod_1.z.literal('')),
});
// Update Profile
// eslint-disable-next-line @typescript-eslint/no-explicit-any
router.patch('/me', auth_middleware_1.authenticateUser, restriction_middleware_1.checkRestriction, async (req, res) => {
    try {
        const { firstName, lastName, email, password } = updateProfileSchema.parse(req.body);
        const userId = req.user.id;
        // Ensure user exists
        const user = await client_2.prisma.user.findUnique({ where: { id: userId } });
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = {};
        if (firstName)
            data.firstName = firstName;
        if (lastName)
            data.lastName = lastName;
        if (firstName || lastName)
            data.name = `${firstName || user.firstName} ${lastName || user.lastName}`;
        if (email && email !== user.email) {
            const exists = await client_2.prisma.user.findUnique({ where: { email } });
            if (exists) {
                return res.status(400).json({ message: 'Email already in use' });
            }
            data.email = email;
        }
        if (password && passwordPolicy_1.STRONG_PASSWORD_REGEX.test(password)) {
            data.password = await bcryptjs_1.default.hash(password, 10);
            data.mustChangePassword = false; // Reset the mandatory change flag
        }
        const updatedUser = await client_2.prisma.user.update({
            where: { id: userId },
            data,
        });
        res.json({
            message: 'Profile updated successfully',
            user: {
                id: updatedUser.id,
                email: updatedUser.email,
                country: updatedUser.country,
                type: 'user',
                firstName: updatedUser.firstName,
                lastName: updatedUser.lastName,
                name: updatedUser.name
            }
        });
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return res.status(400).json({ errors: error.errors });
        }
        console.error('Update profile error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
exports.default = router;
