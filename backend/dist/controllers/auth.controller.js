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
exports.getMe = exports.logout = exports.login = void 0;
const client_1 = require("../db/client");
const auditService = __importStar(require("../services/audit.service"));
const client_2 = require("@prisma/client");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const jwt_1 = require("../config/jwt");
// const prisma = new PrismaClient();
const COOKIE_OPTIONS = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production', // False in dev (allows http://localhost)
    sameSite: 'lax', // Strict can block redirects, Lax is better for auth flows
    path: '/'
};
const login = async (req, res) => {
    try {
        const { email, password, rememberMe } = req.body;
        if (!email || !password) {
            res.status(400).json({ message: 'Email and password are required' });
            return;
        }
        const admin = await client_1.prisma.admin.findUnique({
            where: { email },
        });
        if (!admin) {
            res.status(401).json({ message: 'Invalid credentials' });
            return; // Key to stop execution after response
        }
        const isPasswordValid = await bcryptjs_1.default.compare(password, admin.password);
        if (!isPasswordValid) {
            res.status(401).json({ message: 'Invalid credentials' });
            return;
        }
        // Token expiry: 30 days if rememberMe, else 24 hours (dashboard usage)
        const expiresIn = rememberMe ? '30d' : '24h';
        const token = jsonwebtoken_1.default.sign({ id: admin.id, email: admin.email, role: admin.role }, (0, jwt_1.getJwtSecret)(), { expiresIn });
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
                action: client_2.AuditActionType.LOGIN,
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
    }
    catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
exports.login = login;
const logout = (req, res) => {
    res.clearCookie('admin_token', COOKIE_OPTIONS);
    res.json({ message: 'Logged out successfully' });
};
exports.logout = logout;
const getMe = async (req, res) => {
    if (!req.user) {
        res.status(401).json({ message: 'Not authenticated' });
        return;
    }
    // Optional: Fetch fresh data from DB if needed, but token payload is usually enough
    res.json({
        user: req.user
    });
};
exports.getMe = getMe;
