"use strict";
/**
 * API Key Service
 *
 * Secure API key management with hash-only storage.
 * Keys are shown once on creation and stored as SHA-256 hashes.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getWorkspaceUsageStats = exports.getGlobalUsageLogs = exports.getWorkspaceUsageLogs = exports.logApiUsage = exports.hasScope = exports.isApiKeyValid = exports.touchApiKeyUsage = exports.findApiKeyByHash = exports.updateApiKeyRateLimit = exports.rotateApiKey = exports.revokeApiKey = exports.getApiKeyById = exports.listApiKeys = exports.createApiKey = exports.getApiKeyRateLimitOverride = exports.hashApiKey = void 0;
const crypto_1 = __importDefault(require("crypto"));
const client_1 = require("../db/client");
const client_2 = require("@prisma/client");
const enterprise_quota_service_1 = require("./enterprise-quota.service");
// ============================================
// Helper Functions
// ============================================
/**
 * Generate a secure random API key
 * Format: vlnk_<32 bytes hex> = vlnk_ + 64 chars
 */
const generateApiKey = () => {
    const randomBytes = crypto_1.default.randomBytes(32);
    const keyBody = randomBytes.toString('hex');
    const plainKey = `vlnk_${keyBody}`;
    const prefix = `vlnk_${keyBody.substring(0, 8)}`;
    const hash = crypto_1.default.createHash('sha256').update(plainKey).digest('hex');
    return { plainKey, prefix, hash };
};
/**
 * Hash a plain text API key for lookup
 */
const hashApiKey = (plainKey) => {
    return crypto_1.default.createHash('sha256').update(plainKey).digest('hex');
};
exports.hashApiKey = hashApiKey;
const getApiKeyRateLimitMap = async (apiKeyIds) => {
    if (apiKeyIds.length === 0)
        return new Map();
    try {
        const rows = await client_1.prisma.$queryRaw `
            SELECT "id", "rateLimitRpm"
            FROM "ApiKey"
            WHERE "id" IN (${client_2.Prisma.join(apiKeyIds)})
        `;
        return new Map(rows.map((row) => [row.id, row.rateLimitRpm]));
    }
    catch {
        return new Map(apiKeyIds.map((id) => [id, null]));
    }
};
const getApiKeyRateLimitOverride = async (apiKeyId) => {
    const map = await getApiKeyRateLimitMap([apiKeyId]);
    return map.get(apiKeyId) ?? null;
};
exports.getApiKeyRateLimitOverride = getApiKeyRateLimitOverride;
/**
 * Transform database ApiKey to response format
 */
const toApiKeyResponse = (key, rateLimitRpm = null) => ({
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
const createApiKey = async (input) => {
    if (!input.skipEnterpriseQuotaCheck) {
        const quotaSnapshot = await (0, enterprise_quota_service_1.assertEnterpriseQuotaByWorkspaceId)(input.workspaceId, 'API_KEYS');
        if (!quotaSnapshot) {
            throw new Error('Enterprise plan required');
        }
    }
    const { plainKey, prefix, hash } = generateApiKey();
    const apiKey = await client_1.prisma.apiKey.create({
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
            await client_1.prisma.$executeRaw `
                UPDATE "ApiKey"
                SET "rateLimitRpm" = ${input.rateLimitRpm ?? null}
                WHERE "id" = ${apiKey.id}
            `;
        }
        catch {
            // Backward compatibility: column may not exist in older DBs.
        }
    }
    const rateLimitRpm = await (0, exports.getApiKeyRateLimitOverride)(apiKey.id);
    return {
        apiKey: toApiKeyResponse(apiKey, rateLimitRpm),
        plainTextKey: plainKey
    };
};
exports.createApiKey = createApiKey;
/**
 * List all API keys for a workspace (without hash)
 */
const listApiKeys = async (workspaceId) => {
    const keys = await client_1.prisma.apiKey.findMany({
        where: { workspaceId },
        orderBy: { createdAt: 'desc' }
    });
    const rateLimitMap = await getApiKeyRateLimitMap(keys.map((key) => key.id));
    return keys.map((key) => toApiKeyResponse(key, rateLimitMap.get(key.id) ?? null));
};
exports.listApiKeys = listApiKeys;
/**
 * Get an API key by ID
 */
const getApiKeyById = async (id) => {
    const key = await client_1.prisma.apiKey.findUnique({ where: { id } });
    if (!key)
        return null;
    const rateLimitRpm = await (0, exports.getApiKeyRateLimitOverride)(key.id);
    return toApiKeyResponse(key, rateLimitRpm);
};
exports.getApiKeyById = getApiKeyById;
/**
 * Revoke an API key
 */
const revokeApiKey = async (id) => {
    const key = await client_1.prisma.apiKey.update({
        where: { id },
        data: { revokedAt: new Date() }
    });
    const rateLimitRpm = await (0, exports.getApiKeyRateLimitOverride)(key.id);
    return toApiKeyResponse(key, rateLimitRpm);
};
exports.revokeApiKey = revokeApiKey;
/**
 * Rotate an API key (revoke old, create new with same settings)
 */
const rotateApiKey = async (id, userId) => {
    const oldKey = await client_1.prisma.apiKey.findUnique({ where: { id } });
    if (!oldKey) {
        throw new Error('API key not found');
    }
    const oldRateLimit = await (0, exports.getApiKeyRateLimitOverride)(id);
    // Revoke old key
    await (0, exports.revokeApiKey)(id);
    // Create new key with same settings
    return (0, exports.createApiKey)({
        workspaceId: oldKey.workspaceId,
        name: `${oldKey.name} (rotated)`,
        scopes: oldKey.scopes,
        createdById: userId,
        expiresAt: oldKey.expiresAt,
        rateLimitRpm: oldRateLimit,
        skipEnterpriseQuotaCheck: false
    });
};
exports.rotateApiKey = rotateApiKey;
const updateApiKeyRateLimit = async (id, rateLimitRpm) => {
    await client_1.prisma.$executeRaw `
        UPDATE "ApiKey"
        SET "rateLimitRpm" = ${rateLimitRpm}
        WHERE "id" = ${id}
    `;
    const updated = await client_1.prisma.apiKey.findUnique({ where: { id } });
    if (!updated) {
        throw new Error('API key not found');
    }
    const persistedRateLimit = await (0, exports.getApiKeyRateLimitOverride)(id);
    return toApiKeyResponse(updated, persistedRateLimit);
};
exports.updateApiKeyRateLimit = updateApiKeyRateLimit;
/**
 * Lookup API key by hash (for authentication)
 */
const findApiKeyByHash = async (keyHash) => {
    return client_1.prisma.apiKey.findFirst({
        where: { keyHash }
    });
};
exports.findApiKeyByHash = findApiKeyByHash;
/**
 * Update last used timestamp
 */
const touchApiKeyUsage = async (id) => {
    await client_1.prisma.apiKey.update({
        where: { id },
        data: { lastUsedAt: new Date() }
    });
};
exports.touchApiKeyUsage = touchApiKeyUsage;
/**
 * Check if API key is valid (not revoked, not expired)
 */
const isApiKeyValid = (key) => {
    if (key.revokedAt) {
        return { valid: false, reason: 'API key has been revoked' };
    }
    if (key.expiresAt && key.expiresAt.getTime() < Date.now()) {
        return { valid: false, reason: 'API key has expired' };
    }
    return { valid: true };
};
exports.isApiKeyValid = isApiKeyValid;
/**
 * Check if API key has required scope
 */
const hasScope = (key, requiredScope) => {
    return key.scopes.includes(requiredScope);
};
exports.hasScope = hasScope;
/**
 * Log API key usage
 */
const logApiUsage = async (input) => {
    await client_1.prisma.apiUsageLog.create({
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
exports.logApiUsage = logApiUsage;
/**
 * Get usage logs for a workspace
 */
const getWorkspaceUsageLogs = async (workspaceId, options = {}) => {
    const { limit = 50, offset = 0, apiKeyId } = options;
    // Get all API keys for this workspace
    const apiKeyIds = apiKeyId
        ? [apiKeyId]
        : (await client_1.prisma.apiKey.findMany({
            where: { workspaceId },
            select: { id: true }
        })).map(k => k.id);
    const where = {
        apiKeyId: { in: apiKeyIds }
    };
    const [logs, total] = await Promise.all([
        client_1.prisma.apiUsageLog.findMany({
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
        client_1.prisma.apiUsageLog.count({ where })
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
exports.getWorkspaceUsageLogs = getWorkspaceUsageLogs;
const getGlobalUsageLogs = async (options = {}) => {
    const { limit = 100, offset = 0, workspaceId, apiKeyId } = options;
    const where = {};
    if (apiKeyId) {
        where.apiKeyId = apiKeyId;
    }
    else if (workspaceId) {
        const keys = await client_1.prisma.apiKey.findMany({
            where: { workspaceId },
            select: { id: true }
        });
        where.apiKeyId = { in: keys.map((key) => key.id) };
    }
    const [logs, total] = await Promise.all([
        client_1.prisma.apiUsageLog.findMany({
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
        client_1.prisma.apiUsageLog.count({ where })
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
exports.getGlobalUsageLogs = getGlobalUsageLogs;
/**
 * Get usage statistics for a workspace
 */
const getWorkspaceUsageStats = async (workspaceId, days = 30) => {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);
    const apiKeyIds = (await client_1.prisma.apiKey.findMany({
        where: { workspaceId },
        select: { id: true }
    })).map(k => k.id);
    const logs = await client_1.prisma.apiUsageLog.findMany({
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
    const byDay = {};
    const byEndpoint = {};
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
exports.getWorkspaceUsageStats = getWorkspaceUsageStats;
