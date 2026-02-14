import { prisma } from '../db/client';
import { AuditActionType, Prisma } from '@prisma/client';
import crypto from 'crypto';
import * as realtimeService from './realtime.service';
import * as alertService from './alert.service';

// Types
export interface AuditLogParams {
    adminId: string;
    actorRole?: string;
    action: AuditActionType;
    entity: string;
    targetId?: string;
    details?: string;
    snapshot?: any; // Before/After state
    ipAddress?: string;
    userAgent?: string;
}

// Helper: Compute SHA-256 Hash
const computeHash = (data: string): string => {
    return crypto.createHash('sha256').update(data).digest('hex');
};

const getRetentionUntil = () => {
    const days = Number(process.env.AUDIT_LOG_RETENTION_DAYS || 365);
    if (!Number.isFinite(days) || days <= 0) return null;
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d;
};

const buildHashPayload = (previousHash: string, params: AuditLogParams, timestamp: string) => {
    return `${previousHash}|${params.adminId}|${params.actorRole || ''}|${params.action}|${params.entity}|${params.targetId || ''}|${timestamp}|${params.details || ''}`;
};

/**
 * Log an immutable admin action with hash chaining.
 */
export const logAction = async (params: AuditLogParams) => {
    try {
        // 1. Get the last log to establish the chain
        const lastLog = await prisma.adminLog.findFirst({
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
        const logEntry = await prisma.adminLog.create({
            data: {
                adminId: params.adminId,
                actorRole: params.actorRole as any,
                action: params.action,
                entity: params.entity,
                targetId: params.targetId,
                details: params.details,
                snapshot: params.snapshot || Prisma.JsonNull,
                ipAddress: params.ipAddress,
                userAgent: params.userAgent,
                previousHash,
                currentHash,
                immutable: true,
                retentionUntil: getRetentionUntil()
                ,
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

    } catch (error) {
        console.error('[AuditService] Failed to log action:', error);
        // Critical: In strict audit systems, failing to log might block the action.
        // For MVP, logging failure shouldn't crash the app, but alert admin.
    }
};

export const logActionTx = async (tx: Prisma.TransactionClient, params: AuditLogParams) => {
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
            actorRole: params.actorRole as any,
            action: params.action,
            entity: params.entity,
            targetId: params.targetId,
            details: params.details,
            snapshot: params.snapshot || Prisma.JsonNull,
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

/**
 * Retrieve paginated logs with filters.
 */
export const getLogs = async (
    page: number = 1,
    limit: number = 20,
    filters?: {
        adminId?: string;
        action?: AuditActionType;
        entity?: string;
        startDate?: Date;
        endDate?: Date;
    }
) => {
    const skip = (page - 1) * limit;
    const where: Prisma.AdminLogWhereInput = {};

    if (filters?.adminId) where.adminId = filters.adminId;
    if (filters?.action) where.action = filters.action;
    if (filters?.entity) where.entity = { contains: filters.entity, mode: 'insensitive' };
    if (filters?.startDate || filters?.endDate) {
        where.createdAt = {};
        if (filters.startDate) where.createdAt.gte = filters.startDate;
        if (filters.endDate) where.createdAt.lte = filters.endDate;
    }

    const [logs, total] = await Promise.all([
        prisma.adminLog.findMany({
            where,
            include: { admin: { select: { id: true, firstName: true, lastName: true, email: true, role: true } } },
            orderBy: { createdAt: 'desc' },
            skip,
            take: limit
        }),
        prisma.adminLog.count({ where })
    ]);

    return { logs, total, page, limit };
};

/**
 * Get Audit Analytics (Actions per day, Top Admins)
 */
export const getAnalytics = async () => {
    // 1. Action Distribution
    const actionCounts = await prisma.adminLog.groupBy({
        by: ['action'],
        _count: { action: true }
    });

    // 2. Top Active Admins
    const topAdmins = await prisma.adminLog.groupBy({
        by: ['adminId'],
        _count: { _all: true },
        orderBy: { _count: { adminId: 'desc' } },
        take: 5
    });

    // Resolve Admin Names
    const adminDetails = await prisma.admin.findMany({
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

/**
 * Export logs as CSV for compliance reporting.
 * Returns a Promise that resolves to a CSV string (suitable for smaller exports) 
 * or handles streaming if adapted. For this MVP, we return strict formatted CSV string.
 */
export const exportLogs = async (filters?: { startDate?: Date; endDate?: Date }) => {
    const where: Prisma.AdminLogWhereInput = {};
    if (filters?.startDate || filters?.endDate) {
        where.createdAt = {};
        if (filters.startDate) where.createdAt.gte = filters.startDate;
        if (filters.endDate) where.createdAt.lte = filters.endDate;
    }

    // Fetch all matching logs (Batching might be needed for millions, keeping simple for now)
    const logs = await prisma.adminLog.findMany({
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

export const exportLogsJson = async (filters?: { startDate?: Date; endDate?: Date }) => {
    const where: Prisma.AdminLogWhereInput = {};
    if (filters?.startDate || filters?.endDate) {
        where.createdAt = {};
        if (filters.startDate) where.createdAt.gte = filters.startDate;
        if (filters.endDate) where.createdAt.lte = filters.endDate;
    }

    const logs = await prisma.adminLog.findMany({
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
