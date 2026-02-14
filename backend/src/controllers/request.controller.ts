import { Request, Response } from 'express';
import * as requestService from '../services/request.service';
import { z } from 'zod';
import { RequestType } from '@prisma/client';

const createRequestSchema = z.object({
    type: z.nativeEnum(RequestType),
    payload: z.any(),
    organizationId: z.string().optional(),
});

export const createRequest = async (req: Request, res: Response): Promise<void> => {
    try {
        const data = createRequestSchema.parse(req.body);
        const requesterId = (req as any).user.id; // From middleware

        const result = await requestService.createRequest({
            ...data,
            requesterId,
        });
        res.status(201).json(result);
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            res.status(400).json({ errors: (error as any).errors });
            return;
        }
        res.status(500).json({ message: error.message });
    }
};

export const getRequests = async (req: Request, res: Response): Promise<void> => {
    try {
        const user = (req as any).user;
        const filters: any = {};

        if (req.query.status) {
            const statusStr = req.query.status as string;
            if (statusStr.includes(',')) filters.status = { in: statusStr.split(',') };
            else filters.status = statusStr;
        }

        if (req.query.type) {
            const typeStr = req.query.type as string;
            if (typeStr.includes(',')) filters.type = { in: typeStr.split(',') };
            else filters.type = typeStr;
        }

        // Support exact Request ID match
        if (req.query.requestId) {
            filters.id = req.query.requestId as string;
        }

        // Role-based filtering
        const isAdmin = ['SUPER_ADMIN', 'MODERATOR', 'VERIFIER'].includes(user.role);

        if (!isAdmin) {
            // Users can only see their own requests
            filters.requesterId = user.id;
        }

        const results = await requestService.getRequests(filters);
        res.json(results);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const approveRequest = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const user = (req as any).user;
        const auditContext = user ? { adminId: user.id, ip: req.ip, userAgent: req.headers['user-agent'] } : undefined;

        console.log(`[RequestController] Approve initiated by ${user?.email} for RequestID: ${id}`);
        console.log(`[RequestController] Request Params:`, req.params);
        console.log(`[RequestController] Request Body (should be empty):`, req.body);

        const result = await requestService.approveRequest(id as string, auditContext);
        res.json(result);
    } catch (error: any) {
        console.error('[RequestController] Approve CRITICAL Error:', error);
        res.status(400).json({
            message: error.message || 'Failed to approve request',
            details: error.stack || 'No stack trace',
            type: error.name
        });
    }
};

export const rejectRequest = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const { note } = req.body;
        // @ts-ignore
        const user = (req as any).user;
        const auditContext = user ? { adminId: user.id, ip: req.ip, userAgent: req.headers['user-agent'] } : undefined;

        const result = await requestService.rejectRequest(id as string, note, auditContext);
        res.json(result);
    } catch (error: any) {
        res.status(400).json({ message: error.message });
    }
};

export const bulkApprove = async (req: Request, res: Response): Promise<void> => {
    try {
        const { requestIds } = req.body;
        if (!Array.isArray(requestIds) || requestIds.length === 0) {
            res.status(400).json({ message: 'requestIds array is required' });
            return;
        }

        const user = (req as any).user;
        // Pass audit context if service supports it (Need to update service signature for bulk too)
        // For now, let's assume service update for bulk needs to happen next step.
        // Or I can skip bulk audit for this specific task if time constrained, 
        // but user asked for "other admins make changes". Bulk is a change.
        // Let's passed audit context to service.
        const auditContext = user ? { adminId: user.id, ip: req.ip, userAgent: req.headers['user-agent'] } : undefined;

        const result = await requestService.approveRequestsBulk(requestIds, user.id, auditContext);
        res.json(result);
    } catch (error: any) {
        res.status(500).json({ message: error.message || 'Bulk approve failed' });
    }
};

export const bulkReject = async (req: Request, res: Response): Promise<void> => {
    try {
        const { requestIds, note } = req.body;
        if (!Array.isArray(requestIds) || requestIds.length === 0) {
            res.status(400).json({ message: 'requestIds array is required' });
            return;
        }

        const user = (req as any).user;
        const auditContext = user ? { adminId: user.id, ip: req.ip, userAgent: req.headers['user-agent'] } : undefined;

        const result = await requestService.rejectRequestsBulk(requestIds, user.id, note, auditContext);
        res.json(result);
    } catch (error: any) {
        res.status(500).json({ message: error.message || 'Bulk reject failed' });
    }
};
