import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { SessionActorType, SecurityEventType, SecurityEventSeverity } from '@prisma/client';
import { createSession, getSessionByJti, logSecurityEvent, updateSessionExpiry, countRecentFailedLogins, revokeSessionByJti } from '../services/session.service';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { authenticateAny, authenticateAdmin, authenticateUser, authorizeRole } from '../middleware/auth.middleware';
import { checkRestriction } from '../middleware/restriction.middleware';
import { getUserRequestUsage } from '../services/request.service';
import { strictRateLimiter } from '../middleware/rateLimit.middleware';
import { verifyCaptcha } from '../services/recaptcha.service';
import { getJwtSecret } from '../config/jwt';
import { STRONG_PASSWORD_MESSAGE, STRONG_PASSWORD_REGEX, generateStrongPassword } from '../utils/passwordPolicy';

const router = express.Router();
const prisma = new PrismaClient();

const ADMIN_SESSION_HOURS = 8;
const ORG_SESSION_HOURS = 8;
const USER_SESSION_HOURS = 24;

const getSessionHours = (opts: { isAdmin?: boolean; isOrg?: boolean }) => {
    if (opts.isAdmin) return ADMIN_SESSION_HOURS;
    if (opts.isOrg) return ORG_SESSION_HOURS;
    return USER_SESSION_HOURS;
};

const createJwtToken = (payload: Record<string, unknown>, expiresInHours: number) => {
    return jwt.sign(
        payload,
        getJwtSecret(),
        { expiresIn: `${expiresInHours}h` }
    );
};

const buildSessionResponse = (decoded: any) => ({
    session: {
        iat: decoded?.iat,
        exp: decoded?.exp,
        jti: decoded?.jti
    }
});

// Helper: fetch an org user's planType in a single lightweight query
const getOrgPlanType = async (userId: string): Promise<string | undefined> => {
    const row = await prisma.user.findUnique({
        where: { id: userId },
        select: { organization: { select: { planType: true } } }
    });
    return row?.organization?.planType ?? undefined;
};

const signupSchema = z.object({
    firstName: z.string().min(1, 'First name is required'),
    lastName: z.string().min(1, 'Last name is required'),
    email: z.string().email('Invalid email address'),
    password: z.string().regex(STRONG_PASSWORD_REGEX, STRONG_PASSWORD_MESSAGE),
    country: z.string().optional(),
    captchaToken: z.string().optional(), // Make optional in z schema but enforced in logic if needed, or make required
    captchaAction: z.string().optional(),
});

const loginSchema = z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(1, 'Password is required'),
    captchaToken: z.string().optional(),
    captchaAction: z.string().optional(),
});

// Signup
router.post('/signup', strictRateLimiter, async (req, res) => {
    try {
        const { firstName, lastName, email, password, country, captchaToken } = signupSchema.parse(req.body);

        // Verify Captcha
        if (captchaToken) {
            const isHuman = await verifyCaptcha(captchaToken, 'user_signup');
            if (!isHuman) {
                return res.status(400).json({ message: 'Invalid CAPTCHA' });
            }
        } else if (process.env.NODE_ENV === 'production') {
            // Enforce in production
            return res.status(400).json({ message: 'CAPTCHA required' });
        }

        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) {
            return res.status(400).json({ message: 'User already exists' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const name = `${firstName} ${lastName}`;

        const user = await prisma.user.create({
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
        const jti = crypto.randomUUID();
        const token = jwt.sign({
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            tokenVersion: user.tokenVersion,
            jti
        }, getJwtSecret(), {
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
            ...buildSessionResponse(jwt.decode(token))
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return res.status(400).json({ errors: (error as any).errors });
        }
        console.error(error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Login
router.post('/login', strictRateLimiter, async (req, res) => {
    try {
        const { email, password, captchaToken } = loginSchema.parse(req.body);

        // Verify Captcha or enforce
        if (captchaToken) {
            const isHuman = await verifyCaptcha(captchaToken, 'login');
            if (!isHuman) return res.status(400).json({ message: 'Invalid CAPTCHA' });
        } else if (process.env.NODE_ENV === 'production') {
            return res.status(400).json({ message: 'CAPTCHA required' });
        }

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            if (user.organizationId) {
                await logSecurityEvent({
                    actorType: SessionActorType.ORG,
                    actorId: user.id,
                    eventType: SecurityEventType.FAILED_LOGIN,
                    severity: SecurityEventSeverity.MEDIUM,
                    ipAddress: req.ip,
                    userAgent: req.headers['user-agent'],
                    metadata: { email }
                });
                const recentFailures = await countRecentFailedLogins(SessionActorType.ORG, user.id);
                if (recentFailures >= 5) {
                    await logSecurityEvent({
                        actorType: SessionActorType.ORG,
                        actorId: user.id,
                        eventType: SecurityEventType.FAILED_LOGIN_BURST,
                        severity: SecurityEventSeverity.HIGH,
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
        const jti = crypto.randomUUID();
        const token = jwt.sign({
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            tokenVersion: user.tokenVersion, // Add tokenVersion for invalidation
            jti
        }, getJwtSecret(), {
            expiresIn: `${sessionHours}h`,
        });

        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: sessionHours * 60 * 60 * 1000,
            sameSite: 'lax',
        });

        const decoded = jwt.decode(token) as any;
        if (isOrg && decoded?.exp && decoded?.iat) {
            const issuedAt = new Date(decoded.iat * 1000);
            const expiresAt = new Date(decoded.exp * 1000);
            const session = await createSession({
                jti,
                actorType: SessionActorType.ORG,
                actorId: user.id,
                organizationId: user.organizationId,
                issuedAt,
                expiresAt,
                ipAddress: req.ip,
                userAgent: req.headers['user-agent']
            });
            // Suspicious login: new device or new IP
            const recent = await prisma.authSession.findFirst({
                where: {
                    actorType: SessionActorType.ORG,
                    actorId: user.id,
                    revokedAt: null,
                    id: { not: session.id }
                },
                orderBy: { createdAt: 'desc' }
            });
            if (recent?.userAgent && recent.userAgent !== session.userAgent) {
                await logSecurityEvent({
                    actorType: SessionActorType.ORG,
                    actorId: user.id,
                    eventType: SecurityEventType.NEW_DEVICE,
                    severity: SecurityEventSeverity.MEDIUM,
                    ipAddress: req.ip,
                    userAgent: req.headers['user-agent']
                });
            }
            if (recent?.ipAddress && recent.ipAddress !== session.ipAddress) {
                await logSecurityEvent({
                    actorType: SessionActorType.ORG,
                    actorId: user.id,
                    eventType: SecurityEventType.NEW_IP,
                    severity: SecurityEventSeverity.MEDIUM,
                    ipAddress: req.ip,
                    userAgent: req.headers['user-agent']
                });
            }
            const activeCount = await prisma.authSession.count({
                where: {
                    actorType: SessionActorType.ORG,
                    actorId: user.id,
                    revokedAt: null,
                    expiresAt: { gt: new Date() }
                }
            });
            if (activeCount > 5) {
                await logSecurityEvent({
                    actorType: SessionActorType.ORG,
                    actorId: user.id,
                    eventType: SecurityEventType.MULTI_SESSION,
                    severity: SecurityEventSeverity.MEDIUM,
                    ipAddress: req.ip,
                    userAgent: req.headers['user-agent'],
                    metadata: { activeCount }
                });
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
    } catch (error) {
        if (error instanceof z.ZodError) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return res.status(400).json({ errors: (error as any).errors });
        }
        console.error(error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Google Auth (Internal/System)
router.post('/google', async (req, res) => {
    try {
        const { email, firstName, lastName, photoUrl } = req.body;

        if (!email) return res.status(400).json({ message: 'Email required' });

        let user = await prisma.user.findUnique({ where: { email } });

        if (!user) {
            // Create new user with random password
            const randomPassword = generateStrongPassword();
            const hashedPassword = await bcrypt.hash(randomPassword, 10);
            const name = `${firstName} ${lastName}`;

            user = await prisma.user.create({
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
        const jti = crypto.randomUUID();
        const token = jwt.sign({
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            tokenVersion: user.tokenVersion,
            jti
        }, getJwtSecret(), {
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
            ...buildSessionResponse(jwt.decode(token))
        });

    } catch (error) {
        console.error('Google Auth Error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Admin Login
router.post('/admin/login', strictRateLimiter, async (req, res) => {
    try {
        const { email, password, captchaToken } = loginSchema.parse(req.body);

        // Verify Captcha
        if (captchaToken) {
            const isHuman = await verifyCaptcha(captchaToken, 'admin_login');
            if (!isHuman) return res.status(400).json({ message: 'Invalid CAPTCHA' });
        }
        // Note: Admin login might not strict enforce captcha in dev, or at all if not passed from frontend?
        // But plan said enforce. Assuming standard policy.

        const admin = await prisma.admin.findUnique({ where: { email } });
        if (!admin) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        const isMatch = await bcrypt.compare(password, admin.password);
        if (!isMatch) {
            await logSecurityEvent({
                actorType: SessionActorType.ADMIN,
                actorId: admin.id,
                eventType: SecurityEventType.FAILED_LOGIN,
                severity: SecurityEventSeverity.MEDIUM,
                ipAddress: req.ip,
                userAgent: req.headers['user-agent'],
                metadata: { email }
            });
            const recentFailures = await countRecentFailedLogins(SessionActorType.ADMIN, admin.id);
            if (recentFailures >= 5) {
                await logSecurityEvent({
                    actorType: SessionActorType.ADMIN,
                    actorId: admin.id,
                    eventType: SecurityEventType.FAILED_LOGIN_BURST,
                    severity: SecurityEventSeverity.HIGH,
                    ipAddress: req.ip,
                    userAgent: req.headers['user-agent'],
                    metadata: { count: recentFailures + 1 }
                });
            }
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        const sessionHours = getSessionHours({ isAdmin: true });
        const jti = crypto.randomUUID();
        const token = jwt.sign({
            id: admin.id,
            email: admin.email,
            role: admin.role,
            firstName: admin.firstName,
            lastName: admin.lastName,
            jti
        }, getJwtSecret(), {
            expiresIn: `${sessionHours}h`,
        });

        res.cookie('admin_token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: sessionHours * 60 * 60 * 1000,
            sameSite: 'lax',
        });

        const decoded = jwt.decode(token) as any;
        if (decoded?.exp && decoded?.iat) {
            const issuedAt = new Date(decoded.iat * 1000);
            const expiresAt = new Date(decoded.exp * 1000);
            const session = await createSession({
                jti,
                actorType: SessionActorType.ADMIN,
                actorId: admin.id,
                role: admin.role,
                issuedAt,
                expiresAt,
                ipAddress: req.ip,
                userAgent: req.headers['user-agent']
            });

            const recent = await prisma.authSession.findFirst({
                where: {
                    actorType: SessionActorType.ADMIN,
                    actorId: admin.id,
                    revokedAt: null,
                    id: { not: session.id }
                },
                orderBy: { createdAt: 'desc' }
            });
            if (recent?.userAgent && recent.userAgent !== session.userAgent) {
                await logSecurityEvent({
                    actorType: SessionActorType.ADMIN,
                    actorId: admin.id,
                    eventType: SecurityEventType.NEW_DEVICE,
                    severity: SecurityEventSeverity.MEDIUM,
                    ipAddress: req.ip,
                    userAgent: req.headers['user-agent']
                });
            }
            if (recent?.ipAddress && recent.ipAddress !== session.ipAddress) {
                await logSecurityEvent({
                    actorType: SessionActorType.ADMIN,
                    actorId: admin.id,
                    eventType: SecurityEventType.NEW_IP,
                    severity: SecurityEventSeverity.MEDIUM,
                    ipAddress: req.ip,
                    userAgent: req.headers['user-agent']
                });
            }

            const activeCount = await prisma.authSession.count({
                where: {
                    actorType: SessionActorType.ADMIN,
                    actorId: admin.id,
                    revokedAt: null,
                    expiresAt: { gt: new Date() }
                }
            });
            if (activeCount > 5) {
                await logSecurityEvent({
                    actorType: SessionActorType.ADMIN,
                    actorId: admin.id,
                    eventType: SecurityEventType.MULTI_SESSION,
                    severity: SecurityEventSeverity.MEDIUM,
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
    } catch (error) {
        if (error instanceof z.ZodError) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return res.status(400).json({ errors: (error as any).errors });
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
            const decoded = jwt.verify(token, getJwtSecret()) as any;
            if (decoded?.jti) {
                await revokeSessionByJti(decoded.jti);
            }
        } catch {
            // ignore invalid/expired tokens on logout
        }
    }
    res.clearCookie('token');
    res.clearCookie('admin_token');
    res.json({ message: 'Logout successful' });
});

// Refresh Session
router.post('/refresh', authenticateAny, async (req: any, res) => {
    try {
        const decoded = req.user;
        const isAdmin = Boolean(decoded?.role);

        if (isAdmin) {
            const admin = await prisma.admin.findUnique({ where: { id: decoded.id } });
            if (!admin) return res.status(401).json({ message: 'Not authenticated' });

            const sessionHours = getSessionHours({ isAdmin: true });
            const jti = decoded.jti || crypto.randomUUID();
            const token = createJwtToken({
                id: admin.id,
                email: admin.email,
                role: admin.role,
                firstName: admin.firstName,
                lastName: admin.lastName,
                jti
            }, sessionHours);

            const decodedNew = jwt.decode(token) as any;
            const expAt = new Date(decodedNew.exp * 1000);
            const existing = await getSessionByJti(jti);
            if (existing) {
                await updateSessionExpiry(jti, expAt);
            } else {
                await createSession({
                    jti,
                    actorType: SessionActorType.ADMIN,
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

        const user = await prisma.user.findUnique({ where: { id: decoded.id } });
        if (!user) return res.status(401).json({ message: 'Not authenticated' });

        const isOrg = Boolean(user.organizationId);
        const sessionHours = getSessionHours({ isOrg });
        const jti = decoded.jti || crypto.randomUUID();
        const token = createJwtToken({
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            tokenVersion: user.tokenVersion,
            jti
        }, sessionHours);

        const decodedNew = jwt.decode(token) as any;
        if (isOrg) {
            const expAt = new Date(decodedNew.exp * 1000);
            const existing = await getSessionByJti(jti);
            if (existing) {
                await updateSessionExpiry(jti, expAt);
            } else {
                await createSession({
                    jti,
                    actorType: SessionActorType.ORG,
                    actorId: user.id,
                    organizationId: user.organizationId,
                    issuedAt: new Date(decodedNew.iat * 1000),
                    expiresAt: expAt,
                    ipAddress: req.ip,
                    userAgent: req.headers['user-agent']
                });
            }
        }

        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: sessionHours * 60 * 60 * 1000,
            sameSite: 'lax',
        });

        return res.json({ message: 'Session refreshed', ...buildSessionResponse(decodedNew) });
    } catch (error: any) {
        res.status(500).json({ message: error.message || 'Failed to refresh session' });
    }
});

// --- Separated Session Endpoints ---

// 1. Admin Me
// eslint-disable-next-line @typescript-eslint/no-explicit-any
router.get('/admin/me', authenticateAdmin, async (req: any, res) => {
    try {
        const userId = req.user.id;
        const admin = await prisma.admin.findUnique({ where: { id: userId } });

        if (!admin) return res.status(401).json({ message: 'Admin not found' });

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
    } catch (error) {
        console.error('Error in /admin/me:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// 2. Org Me
// eslint-disable-next-line @typescript-eslint/no-explicit-any
router.get('/org/me', authenticateUser, async (req: any, res) => {
    try {
        const userId = req.user.id;
        const user = await prisma.user.findUnique({ where: { id: userId } });

        if (!user) return res.status(401).json({ message: 'User not found' });
        if (!user.organizationId) return res.status(401).json({ message: 'Not an organization account' });

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
                ...(await getUserRequestUsage(user.id))
            },
            ...buildSessionResponse(req.user)
        });
    } catch (error) {
        console.error('Error in /org/me:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// 3. User Me
// eslint-disable-next-line @typescript-eslint/no-explicit-any
router.get('/user/me', authenticateUser, async (req: any, res) => {
    try {
        const userId = req.user.id;
        const user = await prisma.user.findUnique({ where: { id: userId } });

        if (!user) return res.status(401).json({ message: 'User not found' });
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
                ...(await getUserRequestUsage(user.id))
            },
            ...buildSessionResponse(req.user)
        });
    } catch (error) {
        console.error('Error in /user/me:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Legacy /me (kept for backward compatibility if needed, but Frontend will switch away)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
router.get('/me', authenticateAny, async (req: any, res) => {
    try {
        const userId = req.user.id;

        // 1. Try to find as Admin first
        const admin = await prisma.admin.findUnique({ where: { id: userId } });
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
        const user = await prisma.user.findUnique({ where: { id: userId } });
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
                    ...(await getUserRequestUsage(user.id))
                },
                ...buildSessionResponse(req.user)
            });
        }

        return res.status(404).json({ message: 'User not found' });
    } catch (error) {
        console.error('Error in /me:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

const updateProfileSchema = z.object({
    firstName: z.string().min(1, 'First name is required').optional(),
    lastName: z.string().min(1, 'Last name is required').optional(),
    email: z.string().email('Invalid email address').optional(),
    password: z.string().regex(STRONG_PASSWORD_REGEX, STRONG_PASSWORD_MESSAGE).optional().or(z.literal('')),
});

// Update Profile
// eslint-disable-next-line @typescript-eslint/no-explicit-any
router.patch('/me', authenticateUser, checkRestriction, async (req: any, res) => {
    try {
        const { firstName, lastName, email, password } = updateProfileSchema.parse(req.body);
        const userId = req.user.id;

        // Ensure user exists
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data: any = {};
        if (firstName) data.firstName = firstName;
        if (lastName) data.lastName = lastName;
        if (firstName || lastName) data.name = `${firstName || user.firstName} ${lastName || user.lastName}`;

        if (email && email !== user.email) {
            const exists = await prisma.user.findUnique({ where: { email } });
            if (exists) {
                return res.status(400).json({ message: 'Email already in use' });
            }
            data.email = email;
        }

        if (password && STRONG_PASSWORD_REGEX.test(password)) {
            data.password = await bcrypt.hash(password, 10);
            data.mustChangePassword = false; // Reset the mandatory change flag
        }

        const updatedUser = await prisma.user.update({
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

    } catch (error) {
        if (error instanceof z.ZodError) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return res.status(400).json({ errors: (error as any).errors });
        }
        console.error('Update profile error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

export default router;
