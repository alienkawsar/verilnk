import { Request, Response } from 'express';
import * as userService from '../services/user.service';
import { z } from 'zod';
import { STRONG_PASSWORD_MESSAGE, STRONG_PASSWORD_REGEX } from '../utils/passwordPolicy';
import { prisma } from '../db/client';

const createUserSchema = z.object({
    email: z.string().email(),
    password: z.string().regex(STRONG_PASSWORD_REGEX, STRONG_PASSWORD_MESSAGE),
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    country: z.string().optional(),
    dailyRequestLimit: z.number().nullable().optional(),
    requestLimit: z.number().nullable().optional(),
    requestLimitWindow: z.number().optional()
});

const updateUserSchema = z.object({
    email: z.string().email().optional(),
    firstName: z.string().min(1).optional(),
    lastName: z.string().min(1).optional(),
    country: z.string().optional(),
    password: z.string().regex(STRONG_PASSWORD_REGEX, STRONG_PASSWORD_MESSAGE).optional(),
    isRestricted: z.boolean().optional(),
    dailyRequestLimit: z.number().nullable().optional(), // Nullable for unlimited
    requestLimit: z.number().nullable().optional(),
    requestLimitWindow: z.number().optional()
});

const isGlobalCountryValue = async (value?: string): Promise<boolean> => {
    if (!value) return false;
    const normalized = value.trim().toUpperCase();
    if (normalized === 'GLOBAL' || normalized === 'GL' || normalized === 'WW') {
        return true;
    }

    const asUuid = z.string().uuid().safeParse(value);
    if (!asUuid.success) return false;

    const country = await prisma.country.findUnique({
        where: { id: value },
        select: { code: true, name: true }
    });
    const code = String(country?.code || '').trim().toUpperCase();
    const name = String(country?.name || '').trim().toUpperCase();
    return code === 'GL' || code === 'WW' || name === 'GLOBAL';
};

export const getUsers = async (req: Request, res: Response): Promise<void> => {
    try {
        const { country, stateId, categoryId, type } = req.query;

        const filters = {
            country: country as string, // Expecting country code (e.g. "US") or ID if User stores ID. User schema says String?
            stateId: stateId as string,
            categoryId: categoryId as string,
            type: type as string
        };

        const users = await userService.getAllUsers(filters);
        res.json(users);
    } catch (error: any) {
        res.status(500).json({ message: 'Error fetching users' });
    }
};

export const createUser = async (req: Request, res: Response): Promise<void> => {
    try {
        const data = createUserSchema.parse(req.body);
        if (await isGlobalCountryValue(data.country)) {
            res.status(400).json({
                code: 'INVALID_COUNTRY',
                message: 'Global is not allowed for user country'
            });
            return;
        }
        // @ts-ignore
        const user = (req as any).user;
        const auditContext = user ? { adminId: user.id, ip: req.ip, userAgent: req.headers['user-agent'] } : undefined;

        const newUser = await userService.createUser(data, auditContext);
        res.status(201).json(newUser);
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ errors: error.issues });
            return;
        }
        res.status(400).json({ message: error.message || 'Error creating user' });
    }
};

export const updateUser = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const data = updateUserSchema.parse(req.body);
        if (await isGlobalCountryValue(data.country)) {
            res.status(400).json({
                code: 'INVALID_COUNTRY',
                message: 'Global is not allowed for user country'
            });
            return;
        }

        // @ts-ignore
        const requester = (req as any).user;
        const auditContext = requester ? { adminId: requester.id, ip: req.ip, userAgent: req.headers['user-agent'] } : undefined;

        const user = await userService.updateUser(id as string, data, auditContext);
        res.json(user);
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ errors: error.issues });
            return;
        }
        res.status(400).json({ message: error.message || 'Error updating user' });
    }
};



export const deleteUser = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        // @ts-ignore
        const requester = (req as any).user;
        const auditContext = requester ? { adminId: requester.id, ip: req.ip, userAgent: req.headers['user-agent'] } : undefined;

        await userService.deleteUser(id as string, auditContext);
        res.json({ message: 'User deleted successfully' });
    } catch (error: any) {
        res.status(400).json({ message: error.message || 'Error deleting user' });
    }
};

import * as auditService from '../services/audit.service';
import { AuditActionType } from '@prisma/client';

export const restrictUser = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const { isRestricted } = req.body;
        // @ts-ignore
        const adminId = req.user.id;

        let restrictedBool: boolean;

        if (typeof isRestricted === 'boolean') {
            restrictedBool = isRestricted;
        } else if (isRestricted === 'true') {
            restrictedBool = true;
        } else if (isRestricted === 'false') {
            restrictedBool = false;
        } else {
            res.status(400).json({ message: 'isRestricted must be a boolean or boolean string' });
            return;
        }

        const user = await userService.restrictUser(id as string, restrictedBool);

        auditService.logAction({
            adminId,
            action: AuditActionType.SUSPEND,
            entity: 'User',
            targetId: id as string,
            details: `User restriction set to: ${restrictedBool}`,
            snapshot: { isRestricted: restrictedBool },
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
        });

        res.json(user);
    } catch (error: any) {
        res.status(400).json({ message: error.message || 'Error updating user restriction' });
    }
};

export const deleteUsersBulk = async (req: Request, res: Response): Promise<void> => {
    try {
        const { ids } = req.body;
        if (!Array.isArray(ids) || ids.length === 0) {
            res.status(400).json({ message: 'Invalid or empty IDs array' });
            return;
        }

        // @ts-ignore
        const requester = (req as any).user;
        const auditContext = requester ? { adminId: requester.id, ip: req.ip, userAgent: req.headers['user-agent'] } : undefined;

        await userService.deleteUsers(ids, auditContext);
        res.json({ message: 'Users deleted successfully' });
    } catch (error: any) {
        res.status(500).json({ message: error.message || 'Error deleting users' });
    }
};

export const updateUsersBulk = async (req: Request, res: Response): Promise<void> => {
    try {
        const { ids, data } = req.body;
        if (!Array.isArray(ids) || ids.length === 0) {
            res.status(400).json({ message: 'Invalid or empty IDs array' });
            return;
        }
        if (!data || typeof data !== 'object') {
            res.status(400).json({ message: 'Invalid data object' });
            return;
        }

        // @ts-ignore
        const requester = (req as any).user;
        const auditContext = requester ? { adminId: requester.id, ip: req.ip, userAgent: req.headers['user-agent'] } : undefined;

        await userService.updateUsersBulk(ids, data, auditContext);
        res.json({ message: 'Users updated successfully' });
    } catch (error: any) {
        res.status(500).json({ message: error.message || 'Error updating users' });
    }
};
