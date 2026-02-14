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
Object.defineProperty(exports, "__esModule", { value: true });
exports.bulkReject = exports.bulkApprove = exports.rejectRequest = exports.approveRequest = exports.getRequests = exports.createRequest = void 0;
const requestService = __importStar(require("../services/request.service"));
const zod_1 = require("zod");
const client_1 = require("@prisma/client");
const createRequestSchema = zod_1.z.object({
    type: zod_1.z.nativeEnum(client_1.RequestType),
    payload: zod_1.z.any(),
    organizationId: zod_1.z.string().optional(),
});
const createRequest = async (req, res) => {
    try {
        const data = createRequestSchema.parse(req.body);
        const requesterId = req.user.id; // From middleware
        const result = await requestService.createRequest({
            ...data,
            requesterId,
        });
        res.status(201).json(result);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            res.status(400).json({ errors: error.errors });
            return;
        }
        res.status(500).json({ message: error.message });
    }
};
exports.createRequest = createRequest;
const getRequests = async (req, res) => {
    try {
        const user = req.user;
        const filters = {};
        if (req.query.status) {
            const statusStr = req.query.status;
            if (statusStr.includes(','))
                filters.status = { in: statusStr.split(',') };
            else
                filters.status = statusStr;
        }
        if (req.query.type) {
            const typeStr = req.query.type;
            if (typeStr.includes(','))
                filters.type = { in: typeStr.split(',') };
            else
                filters.type = typeStr;
        }
        // Support exact Request ID match
        if (req.query.requestId) {
            filters.id = req.query.requestId;
        }
        // Role-based filtering
        const isAdmin = ['SUPER_ADMIN', 'MODERATOR', 'VERIFIER'].includes(user.role);
        if (!isAdmin) {
            // Users can only see their own requests
            filters.requesterId = user.id;
        }
        const results = await requestService.getRequests(filters);
        res.json(results);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getRequests = getRequests;
const approveRequest = async (req, res) => {
    try {
        const { id } = req.params;
        const user = req.user;
        const auditContext = user ? { adminId: user.id, ip: req.ip, userAgent: req.headers['user-agent'] } : undefined;
        console.log(`[RequestController] Approve initiated by ${user?.email} for RequestID: ${id}`);
        console.log(`[RequestController] Request Params:`, req.params);
        console.log(`[RequestController] Request Body (should be empty):`, req.body);
        const result = await requestService.approveRequest(id, auditContext);
        res.json(result);
    }
    catch (error) {
        console.error('[RequestController] Approve CRITICAL Error:', error);
        res.status(400).json({
            message: error.message || 'Failed to approve request',
            details: error.stack || 'No stack trace',
            type: error.name
        });
    }
};
exports.approveRequest = approveRequest;
const rejectRequest = async (req, res) => {
    try {
        const { id } = req.params;
        const { note } = req.body;
        // @ts-ignore
        const user = req.user;
        const auditContext = user ? { adminId: user.id, ip: req.ip, userAgent: req.headers['user-agent'] } : undefined;
        const result = await requestService.rejectRequest(id, note, auditContext);
        res.json(result);
    }
    catch (error) {
        res.status(400).json({ message: error.message });
    }
};
exports.rejectRequest = rejectRequest;
const bulkApprove = async (req, res) => {
    try {
        const { requestIds } = req.body;
        if (!Array.isArray(requestIds) || requestIds.length === 0) {
            res.status(400).json({ message: 'requestIds array is required' });
            return;
        }
        const user = req.user;
        // Pass audit context if service supports it (Need to update service signature for bulk too)
        // For now, let's assume service update for bulk needs to happen next step.
        // Or I can skip bulk audit for this specific task if time constrained, 
        // but user asked for "other admins make changes". Bulk is a change.
        // Let's passed audit context to service.
        const auditContext = user ? { adminId: user.id, ip: req.ip, userAgent: req.headers['user-agent'] } : undefined;
        const result = await requestService.approveRequestsBulk(requestIds, user.id, auditContext);
        res.json(result);
    }
    catch (error) {
        res.status(500).json({ message: error.message || 'Bulk approve failed' });
    }
};
exports.bulkApprove = bulkApprove;
const bulkReject = async (req, res) => {
    try {
        const { requestIds, note } = req.body;
        if (!Array.isArray(requestIds) || requestIds.length === 0) {
            res.status(400).json({ message: 'requestIds array is required' });
            return;
        }
        const user = req.user;
        const auditContext = user ? { adminId: user.id, ip: req.ip, userAgent: req.headers['user-agent'] } : undefined;
        const result = await requestService.rejectRequestsBulk(requestIds, user.id, note, auditContext);
        res.json(result);
    }
    catch (error) {
        res.status(500).json({ message: error.message || 'Bulk reject failed' });
    }
};
exports.bulkReject = bulkReject;
