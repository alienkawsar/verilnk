/**
 * API Key Service
 * 
 * Secure API key management with hash-only storage.
 * Keys are shown once on creation and stored as SHA-256 hashes.
 */

import crypto from 'crypto';
import { prisma } from '../db/client';
import { ApiKey, Prisma } from '@prisma/client';
import { assertEnterpriseQuotaByWorkspaceId } from './enterprise-quota.service';

// ============================================
// Types
// ============================================

export interface CreateApiKeyInput {
    workspaceId: string;
    name: string;
    scopes: string[];
    createdById: string;
    expiresAt?: Date | null;
    rateLimitRpm?: number | null;
    skipEnterpriseQuotaCheck?: boolean;
}

export interface ApiKeyResponse {
    id: string;
    name: string;
    prefix: string;
    scopes: string[];
    workspaceId: string;
    rateLimitRpm: number | null;
    lastUsedAt: Date | null;
    expiresAt: Date | null;
    createdAt: Date;
    isRevoked: boolean;
}

export interface CreateApiKeyResult {
    apiKey: ApiKeyResponse;
    plainTextKey: string;  // Only returned on creation!
}

// ============================================
// Helper Functions
// ============================================

/**
 * Generate a secure random API key
 * Format: vlnk_<32 bytes hex> = vlnk_ + 64 chars
 */
const generateApiKey = (): { plainKey: string; prefix: string; hash: string } => {
    const randomBytes = crypto.randomBytes(32);
    const keyBody = randomBytes.toString('hex');
    const plainKey = `vlnk_${keyBody}`;
    const prefix = `vlnk_${keyBody.substring(0, 8)}`;
    const hash = crypto.createHash('sha256').update(plainKey).digest('hex');

    return { plainKey, prefix, hash };
};

/**
 * Hash a plain text API key for lookup
 */
export const hashApiKey = (plainKey: string): string => {
    return crypto.createHash('sha256').update(plainKey).digest('hex');
};

type ApiKeyRateLimitRow = {
    id: string;
    rateLimitRpm: number | null;
};

const getApiKeyRateLimitMap = async (apiKeyIds: string[]): Promise<Map<string, number | null>> => {
    if (apiKeyIds.length === 0) return new Map();
    try {
        const rows = await prisma.$queryRaw<ApiKeyRateLimitRow[]>`
            SELECT "id", "rateLimitRpm"
            FROM "ApiKey"
            WHERE "id" IN (${Prisma.join(apiKeyIds)})
        `;
        return new Map(rows.map((row) => [row.id, row.rateLimitRpm]));
    } catch {
        return new Map(apiKeyIds.map((id) => [id, null]));
    }
};

export const getApiKeyRateLimitOverride = async (apiKeyId: string): Promise<number | null> => {
    const map = await getApiKeyRateLimitMap([apiKeyId]);
    return map.get(apiKeyId) ?? null;
};

/**
 * Transform database ApiKey to response format
 */
const toApiKeyResponse = (key: ApiKey, rateLimitRpm: number | null = null): ApiKeyResponse => ({
    id: key.id,
    name: key.name,
    prefix: key.prefix,
    scopes: key.scopes,
    workspaceId: key.workspaceId,
    rateLimitRpm,
    lastUsedAt: key.lastUsedAt,
    expiresAt: key.expiresAt,
    createdAt: key.createdAt,
    isRevoked: key.revokedAt !== null
});

// ============================================
// CRUD Operations
// ============================================

/**
 * Create a new API key
 * IMPORTANT: The plain text key is only returned here, never stored!
 */
export const createApiKey = async (input: CreateApiKeyInput): Promise<CreateApiKeyResult> => {
    if (!input.skipEnterpriseQuotaCheck) {
        const quotaSnapshot = await assertEnterpriseQuotaByWorkspaceId(input.workspaceId, 'API_KEYS');
        if (!quotaSnapshot) {
            throw new Error('Enterprise plan required');
        }
    }

    const { plainKey, prefix, hash } = generateApiKey();

    const apiKey = await prisma.apiKey.create({
        data: {
            workspaceId: input.workspaceId,
            name: input.name,
            prefix,
            keyHash: hash,
            scopes: input.scopes,
            expiresAt: input.expiresAt ?? null,
            createdById: input.createdById
        }
    });

    if (input.rateLimitRpm !== undefined) {
        try {
            await prisma.$executeRaw`
                UPDATE "ApiKey"
                SET "rateLimitRpm" = ${input.rateLimitRpm ?? null}
                WHERE "id" = ${apiKey.id}
            `;
        } catch {
            // Backward compatibility: column may not exist in older DBs.
        }
    }

    const rateLimitRpm = await getApiKeyRateLimitOverride(apiKey.id);

    return {
        apiKey: toApiKeyResponse(apiKey, rateLimitRpm),
        plainTextKey: plainKey
    };
};

/**
 * List all API keys for a workspace (without hash)
 */
export const listApiKeys = async (workspaceId: string): Promise<ApiKeyResponse[]> => {
    const keys = await prisma.apiKey.findMany({
        where: { workspaceId },
        orderBy: { createdAt: 'desc' }
    });

    const rateLimitMap = await getApiKeyRateLimitMap(keys.map((key) => key.id));
    return keys.map((key) => toApiKeyResponse(key, rateLimitMap.get(key.id) ?? null));
};

/**
 * Get an API key by ID
 */
export const getApiKeyById = async (id: string): Promise<ApiKeyResponse | null> => {
    const key = await prisma.apiKey.findUnique({ where: { id } });
    if (!key) return null;
    const rateLimitRpm = await getApiKeyRateLimitOverride(key.id);
    return toApiKeyResponse(key, rateLimitRpm);
};

/**
 * Revoke an API key
 */
export const revokeApiKey = async (id: string): Promise<ApiKeyResponse> => {
    const key = await prisma.apiKey.update({
        where: { id },
        data: { revokedAt: new Date() }
    });

    const rateLimitRpm = await getApiKeyRateLimitOverride(key.id);
    return toApiKeyResponse(key, rateLimitRpm);
};

/**
 * Rotate an API key (revoke old, create new with same settings)
 */
export const rotateApiKey = async (id: string, userId: string): Promise<CreateApiKeyResult> => {
    const oldKey = await prisma.apiKey.findUnique({ where: { id } });
    if (!oldKey) {
        throw new Error('API key not found');
    }
    const oldRateLimit = await getApiKeyRateLimitOverride(id);

    // Revoke old key
    await revokeApiKey(id);

    // Create new key with same settings
    return createApiKey({
        workspaceId: oldKey.workspaceId,
        name: `${oldKey.name} (rotated)`,
        scopes: oldKey.scopes,
        createdById: userId,
        expiresAt: oldKey.expiresAt,
        rateLimitRpm: oldRateLimit,
        skipEnterpriseQuotaCheck: false
    });
};

export const updateApiKeyRateLimit = async (
    id: string,
    rateLimitRpm: number | null
): Promise<ApiKeyResponse> => {
    await prisma.$executeRaw`
        UPDATE "ApiKey"
        SET "rateLimitRpm" = ${rateLimitRpm}
        WHERE "id" = ${id}
    `;

    const updated = await prisma.apiKey.findUnique({ where: { id } });
    if (!updated) {
        throw new Error('API key not found');
    }
    const persistedRateLimit = await getApiKeyRateLimitOverride(id);
    return toApiKeyResponse(updated, persistedRateLimit);
};

/**
 * Lookup API key by hash (for authentication)
 */
export const findApiKeyByHash = async (keyHash: string): Promise<ApiKey | null> => {
    return prisma.apiKey.findFirst({
        where: { keyHash }
    });
};

/**
 * Update last used timestamp
 */
export const touchApiKeyUsage = async (id: string): Promise<void> => {
    await prisma.apiKey.update({
        where: { id },
        data: { lastUsedAt: new Date() }
    });
};

/**
 * Check if API key is valid (not revoked, not expired)
 */
export const isApiKeyValid = (key: ApiKey): { valid: boolean; reason?: string } => {
    if (key.revokedAt) {
        return { valid: false, reason: 'API key has been revoked' };
    }

    if (key.expiresAt && key.expiresAt.getTime() < Date.now()) {
        return { valid: false, reason: 'API key has expired' };
    }

    return { valid: true };
};

/**
 * Check if API key has required scope
 */
export const hasScope = (key: ApiKey, requiredScope: string): boolean => {
    return key.scopes.includes(requiredScope);
};

// ============================================
// Usage Logging
// ============================================

export interface LogApiUsageInput {
    apiKeyId: string;
    endpoint: string;
    method: string;
    statusCode: number;
    ip?: string;
    userAgent?: string;
    latencyMs?: number;
}

/**
 * Log API key usage
 */
export const logApiUsage = async (input: LogApiUsageInput): Promise<void> => {
    await prisma.apiUsageLog.create({
        data: {
            apiKeyId: input.apiKeyId,
            endpoint: input.endpoint,
            method: input.method,
            statusCode: input.statusCode,
            ip: input.ip ?? null,
            userAgent: input.userAgent ?? null,
            latencyMs: input.latencyMs ?? null
        }
    });
};

/**
 * Get usage logs for a workspace
 */
export const getWorkspaceUsageLogs = async (
    workspaceId: string,
    options: { limit?: number; offset?: number; apiKeyId?: string } = {}
): Promise<{
    logs: Array<{
        id: string;
        apiKeyId: string;
        apiKeyName: string;
        endpoint: string;
        method: string;
        statusCode: number;
        createdAt: Date;
    }>;
    total: number;
}> => {
    const { limit = 50, offset = 0, apiKeyId } = options;

    // Get all API keys for this workspace
    const apiKeyIds = apiKeyId
        ? [apiKeyId]
        : (await prisma.apiKey.findMany({
            where: { workspaceId },
            select: { id: true }
        })).map(k => k.id);

    const where: Prisma.ApiUsageLogWhereInput = {
        apiKeyId: { in: apiKeyIds }
    };

    const [logs, total] = await Promise.all([
        prisma.apiUsageLog.findMany({
            where,
            include: {
                apiKey: {
                    select: { name: true }
                }
            },
            orderBy: { createdAt: 'desc' },
            take: limit,
            skip: offset
        }),
        prisma.apiUsageLog.count({ where })
    ]);

    return {
        logs: logs.map(log => ({
            id: log.id,
            apiKeyId: log.apiKeyId,
            apiKeyName: log.apiKey.name,
            endpoint: log.endpoint,
            method: log.method,
            statusCode: log.statusCode,
            createdAt: log.createdAt
        })),
        total
    };
};

export const getGlobalUsageLogs = async (options: {
    limit?: number;
    offset?: number;
    workspaceId?: string;
    apiKeyId?: string;
} = {}): Promise<{
    logs: Array<{
        id: string;
        workspaceId: string;
        workspaceName: string;
        apiKeyId: string;
        apiKeyName: string;
        endpoint: string;
        method: string;
        statusCode: number;
        createdAt: Date;
    }>;
    total: number;
}> => {
    const { limit = 100, offset = 0, workspaceId, apiKeyId } = options;
    const where: Prisma.ApiUsageLogWhereInput = {};

    if (apiKeyId) {
        where.apiKeyId = apiKeyId;
    } else if (workspaceId) {
        const keys = await prisma.apiKey.findMany({
            where: { workspaceId },
            select: { id: true }
        });
        where.apiKeyId = { in: keys.map((key) => key.id) };
    }

    const [logs, total] = await Promise.all([
        prisma.apiUsageLog.findMany({
            where,
            include: {
                apiKey: {
                    select: {
                        id: true,
                        name: true,
                        workspaceId: true,
                        workspace: {
                            select: {
                                name: true
                            }
                        }
                    }
                }
            },
            orderBy: { createdAt: 'desc' },
            take: limit,
            skip: offset
        }),
        prisma.apiUsageLog.count({ where })
    ]);

    return {
        logs: logs.map((log) => ({
            id: log.id,
            workspaceId: log.apiKey.workspaceId,
            workspaceName: log.apiKey.workspace.name,
            apiKeyId: log.apiKey.id,
            apiKeyName: log.apiKey.name,
            endpoint: log.endpoint,
            method: log.method,
            statusCode: log.statusCode,
            createdAt: log.createdAt
        })),
        total
    };
};

/**
 * Get usage statistics for a workspace
 */
export const getWorkspaceUsageStats = async (
    workspaceId: string,
    days: number = 30
): Promise<{
    totalRequests: number;
    successRate: number;
    requestsByDay: Array<{ date: string; count: number }>;
    requestsByEndpoint: Array<{ endpoint: string; count: number }>;
}> => {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    const apiKeyIds = (await prisma.apiKey.findMany({
        where: { workspaceId },
        select: { id: true }
    })).map(k => k.id);

    const logs = await prisma.apiUsageLog.findMany({
        where: {
            apiKeyId: { in: apiKeyIds },
            createdAt: { gte: startDate }
        },
        select: {
            statusCode: true,
            endpoint: true,
            createdAt: true
        }
    });

    const totalRequests = logs.length;
    const successfulRequests = logs.filter(l => l.statusCode >= 200 && l.statusCode < 300).length;
    const successRate = totalRequests > 0 ? Math.round((successfulRequests / totalRequests) * 100) : 100;

    // Group by day
    const byDay: Record<string, number> = {};
    const byEndpoint: Record<string, number> = {};

    for (const log of logs) {
        const dateKey = log.createdAt.toISOString().split('T')[0];
        byDay[dateKey] = (byDay[dateKey] || 0) + 1;
        byEndpoint[log.endpoint] = (byEndpoint[log.endpoint] || 0) + 1;
    }

    return {
        totalRequests,
        successRate,
        requestsByDay: Object.entries(byDay)
            .map(([date, count]) => ({ date, count }))
            .sort((a, b) => a.date.localeCompare(b.date)),
        requestsByEndpoint: Object.entries(byEndpoint)
            .map(([endpoint, count]) => ({ endpoint, count }))
            .sort((a, b) => b.count - a.count)
    };
};
