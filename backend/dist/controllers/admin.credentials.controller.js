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
exports.resetEnterprisePassword = exports.resetOrgPassword = exports.updateOrgLoginEmail = void 0;
const client_1 = require("../db/client");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const auditService = __importStar(require("../services/audit.service"));
const client_2 = require("@prisma/client");
const passwordPolicy_1 = require("../utils/passwordPolicy");
// Update Organization Login Email
const updateOrgLoginEmail = async (req, res) => {
    try {
        const { id } = req.params; // Organization ID
        const { email } = req.body;
        if (!email || !email.includes('@')) {
            res.status(400).json({ message: 'Invalid email address' });
            return;
        }
        // Check if Organization exists and get its User
        const org = await client_1.prisma.organization.findUnique({
            where: { id: id },
            include: { users: true }
        });
        if (!org) {
            res.status(404).json({ message: 'Organization not found' });
            return;
        }
        // Assuming 1:1 relation logic for specific "Organization User" based on signup
        // or we target the user associated with this organization.
        // Current schema: Organization has `users User[]`.
        // We need to find the "Main" user ? Or update ALL users?
        // Usually there is one main user created at signup.
        // For MVP/Current state, let's assume we update the User(s) linked to this Org.
        // BUT, if there are multiple users, changing "Login Email" is ambiguous.
        // However, looking at `signupOrganization`, it creates ONE user.
        // And `User` has `organizationId`.
        // Let's find the user where `organizationId` matches.
        // If multiple, we might need to specify which user.
        // For this task, "Organization Login Email" likely refers to the main account.
        // Let's fetch the users.
        const users = await client_1.prisma.user.findMany({ where: { organizationId: id } });
        if (users.length === 0) {
            res.status(404).json({ message: 'No user account found for this organization' });
            return;
        }
        // Target the first user (usually the creator/owner) or handle multiple later.
        // For now, update the first one found, or maybe all?
        // Updating *all* users with same email would be bad if they are different people.
        // Safe bet: The system seems to rely on 1 user per org for now based on "My Organization" context.
        const targetUser = users[0];
        // Unique Check
        const existingUser = await client_1.prisma.user.findUnique({ where: { email } });
        const existingAdmin = await client_1.prisma.admin.findUnique({ where: { email } });
        if (existingUser && existingUser.id !== targetUser.id) {
            res.status(400).json({ message: 'Email already in use by another user' });
            return;
        }
        if (existingAdmin) {
            res.status(400).json({ message: 'Email already in use by an admin' });
            return;
        }
        // Update User Email
        await client_1.prisma.user.update({
            where: { id: targetUser.id },
            data: { email }
        });
        const actor = req.user;
        if (actor?.id) {
            auditService.logAction({
                adminId: actor.id,
                action: client_2.AuditActionType.UPDATE,
                entity: 'OrganizationLoginEmail',
                targetId: id,
                details: `Updated login email for organization ${org.name}`,
                snapshot: { before: targetUser.email, after: email },
                ipAddress: req.ip,
                userAgent: req.headers['user-agent']
            });
        }
        res.json({ message: 'Organization login email updated successfully', email });
    }
    catch (error) {
        console.error('Update Org Email Error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
exports.updateOrgLoginEmail = updateOrgLoginEmail;
// Reset Organization Password
const resetOrgPassword = async (req, res) => {
    try {
        const { id } = req.params; // Organization ID
        const users = await client_1.prisma.user.findMany({ where: { organizationId: id } });
        if (users.length === 0) {
            res.status(404).json({ message: 'No user account found for this organization' });
            return;
        }
        const targetUser = users[0];
        // Generate Secure Temporary Password
        const tempPassword = (0, passwordPolicy_1.generateStrongPassword)();
        const hashedPassword = await bcryptjs_1.default.hash(tempPassword, 10);
        // Transaction: Update Password + Invalidate Sessions
        await client_1.prisma.$transaction(async (tx) => {
            await tx.user.update({
                where: { id: targetUser.id },
                data: {
                    password: hashedPassword,
                    mustChangePassword: true,
                    tokenVersion: { increment: 1 } // Invalidate existing sessions
                }
            });
        }, {
            timeout: 10000,
            maxWait: 5000
        });
        const actor = req.user;
        if (actor?.id) {
            auditService.logAction({
                adminId: actor.id,
                action: client_2.AuditActionType.UPDATE,
                entity: 'OrganizationPasswordReset',
                targetId: id,
                details: 'Reset organization password',
                snapshot: { userId: targetUser.id },
                ipAddress: req.ip,
                userAgent: req.headers['user-agent']
            });
        }
        res.json({
            message: 'Password reset successfully',
            tempPassword: tempPassword // Show ONCE
        });
    }
    catch (error) {
        console.error('Reset Org Password Error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
exports.resetOrgPassword = resetOrgPassword;
// Reset Enterprise Organization Password (forces logout + must change password)
const resetEnterprisePassword = async (req, res) => {
    try {
        const { orgId } = req.params;
        // Verify org exists and is enterprise
        const org = await client_1.prisma.organization.findUnique({
            where: { id: orgId },
            select: { id: true, name: true, planType: true }
        });
        if (!org) {
            res.status(404).json({ message: 'Organization not found' });
            return;
        }
        if (org.planType !== 'ENTERPRISE') {
            res.status(400).json({ message: 'Organization is not an enterprise account' });
            return;
        }
        const users = await client_1.prisma.user.findMany({ where: { organizationId: orgId } });
        if (users.length === 0) {
            res.status(404).json({ message: 'No user account found for this enterprise organization' });
            return;
        }
        const targetUser = users[0];
        // Generate Secure Temporary Password
        const tempPassword = (0, passwordPolicy_1.generateStrongPassword)();
        const hashedPassword = await bcryptjs_1.default.hash(tempPassword, 10);
        // Transaction: Update Password + Set mustChangePassword + Invalidate Sessions
        await client_1.prisma.$transaction(async (tx) => {
            await tx.user.update({
                where: { id: targetUser.id },
                data: {
                    password: hashedPassword,
                    mustChangePassword: true,
                    tokenVersion: { increment: 1 } // Invalidate all existing sessions
                }
            });
        }, {
            timeout: 10000,
            maxWait: 5000
        });
        const actor = req.user;
        if (actor?.id) {
            auditService.logAction({
                adminId: actor.id,
                action: client_2.AuditActionType.UPDATE,
                entity: 'EnterprisePasswordReset',
                targetId: orgId,
                details: `Reset enterprise password for organization ${org.name}`,
                snapshot: { userId: targetUser.id, organizationId: org.id },
                ipAddress: req.ip,
                userAgent: req.headers['user-agent']
            });
        }
        res.json({
            message: 'Enterprise password reset successfully. User must change password on next login.',
            tempPassword: tempPassword // Show ONCE
        });
    }
    catch (error) {
        console.error('Reset Enterprise Password Error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
exports.resetEnterprisePassword = resetEnterprisePassword;
