import { Request, Response } from 'express';
import { prisma } from '../db/client';
import { z } from 'zod';
import * as auditService from '../services/audit.service';
import { AuditActionType } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getJwtSecret } from '../config/jwt';


const COOKIE_OPTIONS = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production', // False in dev (allows http://localhost)
    sameSite: 'lax' as const, // Strict can block redirects, Lax is better for auth flows
    path: '/'
};

export const login = async (req: Request, res: Response): Promise<void> => {
    try {
        const { email, password, rememberMe } = req.body;

        if (!email || !password) {
            res.status(400).json({ message: 'Email and password are required' });
            return;
        }

        const admin = await prisma.admin.findUnique({
            where: { email },
        });

        if (!admin) {
            res.status(401).json({ message: 'Invalid credentials' });
            return; // Key to stop execution after response
        }

        const isPasswordValid = await bcrypt.compare(password, admin.password);

        if (!isPasswordValid) {
            res.status(401).json({ message: 'Invalid credentials' });
            return;
        }

        // Token expiry: 30 days if rememberMe, else 24 hours (dashboard usage)
        const expiresIn = rememberMe ? '30d' : '24h';

        const token = jwt.sign(
            { id: admin.id, email: admin.email, role: admin.role },
            getJwtSecret(),
            { expiresIn }
        );

        // Audit Log: Admin Login
        // This assumes auditService and AuditActionType are imported and available
        // For this to work, you'd need to import them, e.g.:
        // import * as auditService from '../services/auditService';
        // import { AuditActionType } from '../types/audit';
        // And ensure req.ip is available (e.g., via a proxy or express setup)
        // If auditService is not defined, this line will cause a runtime error.
        // For demonstration, I'm adding it as requested.
        if (auditService) {
            auditService.logAction({
                adminId: admin.id,
                action: AuditActionType.LOGIN,
                entity: 'Auth',
                targetId: admin.id,
                details: `Admin login: ${admin.email}`,
                snapshot: { role: admin.role, ip: req.ip },
                ipAddress: req.ip,
                userAgent: req.headers['user-agent']
            });
        }

        // Cookie expiry: match token or session (if no expiry set for cookie, it's session)
        const cookieOptions = {
            ...COOKIE_OPTIONS,
            maxAge: rememberMe ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000
        };

        res.cookie('admin_token', token, cookieOptions);

        res.json({
            message: 'Login successful',
            user: {
                id: admin.id,
                email: admin.email,
                role: admin.role,
            },
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const logout = (req: Request, res: Response): void => {
    res.clearCookie('admin_token', COOKIE_OPTIONS);
    res.json({ message: 'Logged out successfully' });
};

export const getMe = async (req: Request & { user?: any }, res: Response): Promise<void> => {
    if (!req.user) {
        res.status(401).json({ message: 'Not authenticated' });
        return;
    }

    // Optional: Fetch fresh data from DB if needed, but token payload is usually enough
    res.json({
        user: req.user
    });
};
