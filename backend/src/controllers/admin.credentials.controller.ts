import { Request, Response } from 'express';
import { prisma } from '../db/client';
import bcrypt from 'bcryptjs';
import * as auditService from '../services/audit.service';
import { AuditActionType } from '@prisma/client';
import { generateStrongPassword } from '../utils/passwordPolicy';

// Update Organization Login Email
export const updateOrgLoginEmail = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params; // Organization ID
        const { email } = req.body;

        if (!email || !email.includes('@')) {
            res.status(400).json({ message: 'Invalid email address' });
            return;
        }

        // Check if Organization exists and get its User
        const org = await prisma.organization.findUnique({
            where: { id: id as string },
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

        const users = await prisma.user.findMany({ where: { organizationId: id as string } });
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
        const existingUser = await prisma.user.findUnique({ where: { email } });
        const existingAdmin = await prisma.admin.findUnique({ where: { email } });

        if (existingUser && existingUser.id !== targetUser.id) {
            res.status(400).json({ message: 'Email already in use by another user' });
            return;
        }
        if (existingAdmin) {
            res.status(400).json({ message: 'Email already in use by an admin' });
            return;
        }

        // Update User Email
        await prisma.user.update({
            where: { id: targetUser.id },
            data: { email }
        });

        const actor = (req as any).user;
        if (actor?.id) {
            auditService.logAction({
                adminId: actor.id,
                action: AuditActionType.UPDATE,
                entity: 'OrganizationLoginEmail',
                targetId: id as string,
                details: `Updated login email for organization ${org.name}`,
                snapshot: { before: targetUser.email, after: email },
                ipAddress: req.ip,
                userAgent: req.headers['user-agent']
            });
        }

        res.json({ message: 'Organization login email updated successfully', email });

    } catch (error: any) {
        console.error('Update Org Email Error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Reset Organization Password
export const resetOrgPassword = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params; // Organization ID

        const users = await prisma.user.findMany({ where: { organizationId: id as string } });
        if (users.length === 0) {
            res.status(404).json({ message: 'No user account found for this organization' });
            return;
        }
        const targetUser = users[0];

        // Generate Secure Temporary Password
        const tempPassword = generateStrongPassword();

        const hashedPassword = await bcrypt.hash(tempPassword, 10);

        // Transaction: Update Password + Invalidate Sessions
        await prisma.$transaction(async (tx) => {
            await tx.user.update({
                where: { id: targetUser.id },
                data: {
                    password: hashedPassword,
                    mustChangePassword: true,
                    tokenVersion: { increment: 1 } // Invalidate existing sessions
                }
            });
        });

        const actor = (req as any).user;
        if (actor?.id) {
            auditService.logAction({
                adminId: actor.id,
                action: AuditActionType.UPDATE,
                entity: 'OrganizationPasswordReset',
                targetId: id as string,
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

    } catch (error: any) {
        console.error('Reset Org Password Error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
