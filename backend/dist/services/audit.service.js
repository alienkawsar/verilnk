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
exports.exportLogsJson = exports.exportLogs = exports.getAnalytics = exports.getLogs = exports.logActionTx = exports.logAction = void 0;
const client_1 = require("../db/client");
const client_2 = require("@prisma/client");
const crypto_1 = __importDefault(require("crypto"));
const realtimeService = __importStar(require("./realtime.service"));
const alertService = __importStar(require("./alert.service"));
// Helper: Compute SHA-256 Hash
const computeHash = (data) => {
    return crypto_1.default.createHash('sha256').update(data).digest('hex');
};
const getRetentionUntil = () => {
    const days = Number(process.env.AUDIT_LOG_RETENTION_DAYS || 365);
    if (!Number.isFinite(days) || days <= 0)
        return null;
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d;
};
const buildHashPayload = (previousHash, params, timestamp) => {
    return `${previousHash}|${params.adminId}|${params.actorRole || ''}|${params.action}|${params.entity}|${params.targetId || ''}|${timestamp}|${params.details || ''}`;
};
/**
 * Log an immutable admin action with hash chaining.
 */
const logAction = async (params) => {
    try {
        // 1. Get the last log to establish the chain
        const lastLog = await client_1.prisma.adminLog.findFirst({
            orderBy: { createdAt: 'desc' }
        });
        const previousHash = lastLog?.currentHash || 'GENESIS_HASH';
        // 2. Prepare data for hashing (Canonical String)
        // Format: PREV_HASH|ADMIN_ID|ACTION|ENTITY|TARGET_ID|TIMESTAMP
        const timestamp = new Date().toISOString();
        const rawData = buildHashPayload(previousHash, params, timestamp);
        // 3. Compute Current Hash
        const currentHash = computeHash(rawData);
        // 4. Save to DB
        const logEntry = await client_1.prisma.adminLog.create({
            data: {
                adminId: params.adminId,
                actorRole: params.actorRole,
                action: params.action,
                entity: params.entity,
                targetId: params.targetId,
                details: params.details,
                snapshot: params.snapshot || client_2.Prisma.JsonNull,
                ipAddress: params.ipAddress,
                userAgent: params.userAgent,
                previousHash,
                currentHash,
                immutable: true,
                retentionUntil: getRetentionUntil(),
                hashTimestamp: new Date(timestamp)
            }
        });
        // 5. Real-Time Broadcast
        realtimeService.broadcast('LOG', {
            ...logEntry,
            adminName: 'Fetching...' // Ideally fetch name or pass it. Frontend can resolve or backend can enrich.
            // For efficiency, let's just send the log. Frontend logs table fetches admin details.
            // We can do a quick fetch or relying on adminId.
        });
        // 6. Anomaly Detection (Async fire & forget)
        alertService.checkAnomaly(logEntry);
    }
    catch (error) {
        console.error('[AuditService] Failed to log action:', error);
        // Critical: In strict audit systems, failing to log might block the action.
        // For MVP, logging failure shouldn't crash the app, but alert admin.
    }
};
exports.logAction = logAction;
const logActionTx = async (tx, params) => {
    const lastLog = await tx.adminLog.findFirst({
        orderBy: { createdAt: 'desc' }
    });
    const previousHash = lastLog?.currentHash || 'GENESIS_HASH';
    const timestamp = new Date().toISOString();
    const rawData = buildHashPayload(previousHash, params, timestamp);
    const currentHash = computeHash(rawData);
    const logEntry = await tx.adminLog.create({
        data: {
            adminId: params.adminId,
            actorRole: params.actorRole,
            action: params.action,
            entity: params.entity,
            targetId: params.targetId,
            details: params.details,
            snapshot: params.snapshot || client_2.Prisma.JsonNull,
            ipAddress: params.ipAddress,
            userAgent: params.userAgent,
            previousHash,
            currentHash,
            immutable: true,
            retentionUntil: getRetentionUntil(),
            hashTimestamp: new Date(timestamp)
        }
    });
    return logEntry;
};
exports.logActionTx = logActionTx;
/**
 * Retrieve paginated logs with filters.
 */
const getLogs = async (page = 1, limit = 20, filters) => {
    const skip = (page - 1) * limit;
    const where = {};
    if (filters?.adminId)
        where.adminId = filters.adminId;
    if (filters?.action)
        where.action = filters.action;
    if (filters?.entity)
        where.entity = { contains: filters.entity, mode: 'insensitive' };
    if (filters?.startDate || filters?.endDate) {
        where.createdAt = {};
        if (filters.startDate)
            where.createdAt.gte = filters.startDate;
        if (filters.endDate)
            where.createdAt.lte = filters.endDate;
    }
    const [logs, total] = await Promise.all([
        client_1.prisma.adminLog.findMany({
            where,
            include: { admin: { select: { id: true, firstName: true, lastName: true, email: true, role: true } } },
            orderBy: { createdAt: 'desc' },
            skip,
            take: limit
        }),
        client_1.prisma.adminLog.count({ where })
    ]);
    return { logs, total, page, limit };
};
exports.getLogs = getLogs;
/**
 * Get Audit Analytics (Actions per day, Top Admins)
 */
const getAnalytics = async () => {
    // 1. Action Distribution
    const actionCounts = await client_1.prisma.adminLog.groupBy({
        by: ['action'],
        _count: { action: true }
    });
    // 2. Top Active Admins
    const topAdmins = await client_1.prisma.adminLog.groupBy({
        by: ['adminId'],
        _count: { _all: true },
        orderBy: { _count: { adminId: 'desc' } },
        take: 5
    });
    // Resolve Admin Names
    const adminDetails = await client_1.prisma.admin.findMany({
        where: { id: { in: topAdmins.map(a => a.adminId) } },
        select: { id: true, firstName: true, lastName: true, role: true }
    });
    const enrichedTopAdmins = topAdmins.map(curr => {
        const admin = adminDetails.find(a => a.id === curr.adminId);
        return {
            adminId: curr.adminId,
            name: admin ? `${admin.firstName} ${admin.lastName}` : 'Unknown',
            role: admin?.role,
            count: curr._count._all
        };
    });
    return { actionCounts, topAdmins: enrichedTopAdmins };
};
exports.getAnalytics = getAnalytics;
/**
 * Export logs as CSV for compliance reporting.
 * Returns a Promise that resolves to a CSV string (suitable for smaller exports)
 * or handles streaming if adapted. For this MVP, we return strict formatted CSV string.
 */
const exportLogs = async (filters) => {
    const where = {};
    if (filters?.startDate || filters?.endDate) {
        where.createdAt = {};
        if (filters.startDate)
            where.createdAt.gte = filters.startDate;
        if (filters.endDate)
            where.createdAt.lte = filters.endDate;
    }
    // Fetch all matching logs (Batching might be needed for millions, keeping simple for now)
    const logs = await client_1.prisma.adminLog.findMany({
        where,
        include: { admin: { select: { email: true, role: true } } },
        orderBy: { createdAt: 'desc' },
        take: 5000 // Limit export to 5000 for safety, or implement cursor-based stream
    });
    // CSV Header
    const headers = ['Log ID', 'Timestamp (UTC)', 'Admin Email', 'Role', 'Action', 'Entity', 'Target ID', 'Details', 'IP Address', 'Integrity Hash', 'Immutable', 'Retention Until'];
    const rows = logs.map(log => [
        log.id,
        log.createdAt.toISOString(),
        log.admin.email,
        log.actorRole || log.admin.role,
        log.action,
        log.entity || 'N/A',
        log.targetId || 'N/A',
        `"${(log.details || '').replace(/"/g, '""')}"`, // Escape quotes
        log.ipAddress || 'Unknown',
        log.currentHash,
        log.immutable ? 'true' : 'false',
        log.retentionUntil ? log.retentionUntil.toISOString() : ''
    ].join(','));
    return [headers.join(','), ...rows].join('\n');
};
exports.exportLogs = exportLogs;
const exportLogsJson = async (filters) => {
    const where = {};
    if (filters?.startDate || filters?.endDate) {
        where.createdAt = {};
        if (filters.startDate)
            where.createdAt.gte = filters.startDate;
        if (filters.endDate)
            where.createdAt.lte = filters.endDate;
    }
    const logs = await client_1.prisma.adminLog.findMany({
        where,
        include: { admin: { select: { email: true, role: true } } },
        orderBy: { createdAt: 'desc' },
        take: 5000
    });
    return logs.map(log => ({
        id: log.id,
        createdAt: log.createdAt.toISOString(),
        adminEmail: log.admin.email,
        role: log.actorRole || log.admin.role,
        action: log.action,
        entity: log.entity,
        targetId: log.targetId,
        details: log.details,
        ipAddress: log.ipAddress,
        integrityHash: log.currentHash,
        immutable: log.immutable,
        retentionUntil: log.retentionUntil ? log.retentionUntil.toISOString() : null,
        snapshot: log.snapshot
    }));
};
exports.exportLogsJson = exportLogsJson;
