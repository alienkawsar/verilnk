/**
 * API Key Authentication Middleware
 * 
 * Handles Bearer token authentication for API keys with:
 * - Hash-based key lookup
 * - Scope validation
 * - Rate limiting (100/min + burst protection)
 * - Usage logging
 */

import { Request, Response, NextFunction } from 'express';
import { hashApiKey, findApiKeyByHash, getApiKeyRateLimitOverride, isApiKeyValid, hasScope, touchApiKeyUsage, logApiUsage } from '../services/apikey.service';
import { getWorkspaceEntitlements } from '../services/enterprise.entitlement';
import { ApiKey } from '@prisma/client';
import { prisma } from '../db/client';
import * as auditService from '../services/audit.service';
import { AuditActionType } from '@prisma/client';

// ============================================
// Types
// ============================================

export interface ApiKeyRequest extends Request {
    apiKey?: ApiKey;
    workspaceId?: string;
    apiKeyId?: string;
}

// ============================================
// Rate Limiting State (In-Memory)
// ============================================

interface RateLimitState {
    count: number;
    windowStart: number;
    burstCount: number;
    burstWindowStart: number;
}

const rateLimitMap = new Map<string, RateLimitState>();
const workspaceRateLimitMap = new Map<string, RateLimitState>();

const RATE_LIMIT_WINDOW_MS = 60 * 1000;       // 1 minute
const DEFAULT_RATE_LIMIT_MAX_REQUESTS = 100;   // fallback requests per minute
const BURST_WINDOW_MS = 5 * 1000;              // 5 seconds
const DEFAULT_BURST_MAX_REQUESTS = 20;         // fallback burst requests

/**
 * Check and update rate limit for an API key
 */
const checkRateLimit = (
    keyId: string,
    minuteLimit: number,
    burstLimit: number
): { allowed: boolean; remaining: number; resetIn: number } => {
    const now = Date.now();
    let state = rateLimitMap.get(keyId);
    const safeMinuteLimit = Math.max(1, minuteLimit || DEFAULT_RATE_LIMIT_MAX_REQUESTS);
    const safeBurstLimit = Math.max(1, burstLimit || DEFAULT_BURST_MAX_REQUESTS);

    if (!state || now - state.windowStart >= RATE_LIMIT_WINDOW_MS) {
        // New window
        state = {
            count: 1,
            windowStart: now,
            burstCount: 1,
            burstWindowStart: now
        };
        rateLimitMap.set(keyId, state);
        return { allowed: true, remaining: safeMinuteLimit - 1, resetIn: RATE_LIMIT_WINDOW_MS };
    }

    // Check burst limit
    if (now - state.burstWindowStart >= BURST_WINDOW_MS) {
        state.burstCount = 1;
        state.burstWindowStart = now;
    } else {
        state.burstCount++;
        if (state.burstCount > safeBurstLimit) {
            const resetIn = BURST_WINDOW_MS - (now - state.burstWindowStart);
            return { allowed: false, remaining: 0, resetIn };
        }
    }

    // Check minute limit
    state.count++;
    if (state.count > safeMinuteLimit) {
        const resetIn = RATE_LIMIT_WINDOW_MS - (now - state.windowStart);
        return { allowed: false, remaining: 0, resetIn };
    }

    rateLimitMap.set(keyId, state);
    return {
        allowed: true,
        remaining: safeMinuteLimit - state.count,
        resetIn: RATE_LIMIT_WINDOW_MS - (now - state.windowStart)
    };
};

const checkWorkspaceRateLimit = (
    workspaceId: string,
    minuteLimit: number
): { allowed: boolean; remaining: number; resetIn: number } => {
    const now = Date.now();
    let state = workspaceRateLimitMap.get(workspaceId);
    const safeMinuteLimit = Math.max(1, minuteLimit || DEFAULT_RATE_LIMIT_MAX_REQUESTS);

    if (!state || now - state.windowStart >= RATE_LIMIT_WINDOW_MS) {
        state = {
            count: 1,
            windowStart: now,
            burstCount: 1,
            burstWindowStart: now
        };
        workspaceRateLimitMap.set(workspaceId, state);
        return { allowed: true, remaining: safeMinuteLimit - 1, resetIn: RATE_LIMIT_WINDOW_MS };
    }

    state.count++;
    if (state.count > safeMinuteLimit) {
        const resetIn = RATE_LIMIT_WINDOW_MS - (now - state.windowStart);
        return { allowed: false, remaining: 0, resetIn };
    }

    workspaceRateLimitMap.set(workspaceId, state);
    return {
        allowed: true,
        remaining: safeMinuteLimit - state.count,
        resetIn: RATE_LIMIT_WINDOW_MS - (now - state.windowStart)
    };
};

const logRateLimitAudit = async (
    req: Request,
    workspaceId: string,
    apiKeyId: string,
    reason: 'API_KEY_LIMIT_EXCEEDED' | 'WORKSPACE_LIMIT_EXCEEDED'
) => {
    try {
        let admin = null;
        if (process.env.COMPLIANCE_SYSTEM_ADMIN_ID) {
            admin = await prisma.admin.findUnique({
                where: { id: process.env.COMPLIANCE_SYSTEM_ADMIN_ID },
                select: { id: true, role: true }
            });
        }
        if (!admin) {
            admin = await prisma.admin.findFirst({
                where: { role: 'SUPER_ADMIN' },
                orderBy: { createdAt: 'asc' },
                select: { id: true, role: true }
            });
        }
        if (!admin) return;

        await auditService.logAction({
            adminId: admin.id,
            actorRole: admin.role,
            action: AuditActionType.OTHER,
            entity: 'ApiUsageLimit',
            targetId: apiKeyId,
            details: `${reason} workspaceId=${workspaceId} apiKeyId=${apiKeyId} method=${req.method} endpoint=${req.path}`,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
        });
    } catch {
        // best-effort only
    }
};

// ============================================
// Middleware Functions
// ============================================

/**
 * Extract and validate API key from Authorization header
 */
export const authenticateApiKey = async (
    req: ApiKeyRequest,
    res: Response,
    next: NextFunction
): Promise<void> => {
    const startTime = Date.now();
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({
            error: 'Unauthorized',
            message: 'Missing or invalid Authorization header. Use: Bearer <api_key>'
        });
        return;
    }

    const plainKey = authHeader.slice(7); // Remove 'Bearer '

    // Validate key format
    if (!plainKey.startsWith('vlnk_') || plainKey.length !== 69) {
        res.status(401).json({
            error: 'Unauthorized',
            message: 'Invalid API key format'
        });
        return;
    }

    // Hash and lookup
    const keyHash = hashApiKey(plainKey);
    const apiKey = await findApiKeyByHash(keyHash);

    if (!apiKey) {
        res.status(401).json({
            error: 'Unauthorized',
            message: 'Invalid API key'
        });
        return;
    }

    // Check if key is valid (not revoked, not expired)
    const validity = isApiKeyValid(apiKey);
    if (!validity.valid) {
        res.status(401).json({
            error: 'Unauthorized',
            message: validity.reason
        });
        return;
    }

    // Check workspace has enterprise access
    const entitlements = await getWorkspaceEntitlements(apiKey.workspaceId);
    if (!entitlements.hasAccess) {
        res.status(403).json({
            error: 'Forbidden',
            message: 'Enterprise plan required for API access'
        });
        return;
    }

    const workspaceMinuteLimit = entitlements.entitlements.apiRateLimitPerMinute;
    const keyRateLimitOverride = await getApiKeyRateLimitOverride(apiKey.id);
    const minuteLimit = keyRateLimitOverride ?? workspaceMinuteLimit ?? DEFAULT_RATE_LIMIT_MAX_REQUESTS;
    const burstLimit = entitlements.entitlements.apiBurstLimit || DEFAULT_BURST_MAX_REQUESTS;

    // Check rate limit
    const rateLimit = checkRateLimit(apiKey.id, minuteLimit, burstLimit);
    res.setHeader('X-RateLimit-Limit', minuteLimit);
    res.setHeader('X-RateLimit-Remaining', rateLimit.remaining);
    res.setHeader('X-RateLimit-Reset', Math.ceil(rateLimit.resetIn / 1000));

    if (!rateLimit.allowed) {
        await logApiUsage({
            apiKeyId: apiKey.id,
            endpoint: req.path,
            method: req.method,
            statusCode: 429,
            ip: req.ip,
            userAgent: req.headers['user-agent'],
            latencyMs: Date.now() - startTime
        });
        logRateLimitAudit(req, apiKey.workspaceId, apiKey.id, 'API_KEY_LIMIT_EXCEEDED').catch(() => void 0);

        res.status(429).json({
            error: 'Too Many Requests',
            message: 'Rate limit exceeded. Please slow down.',
            retryAfter: Math.ceil(rateLimit.resetIn / 1000)
        });
        return;
    }

    // Workspace aggregate cap (shared across keys)
    const workspaceRateLimit = checkWorkspaceRateLimit(
        apiKey.workspaceId,
        workspaceMinuteLimit || minuteLimit
    );
    res.setHeader('X-Workspace-RateLimit-Limit', workspaceMinuteLimit || minuteLimit);
    res.setHeader('X-Workspace-RateLimit-Remaining', workspaceRateLimit.remaining);
    res.setHeader('X-Workspace-RateLimit-Reset', Math.ceil(workspaceRateLimit.resetIn / 1000));

    if (!workspaceRateLimit.allowed) {
        await logApiUsage({
            apiKeyId: apiKey.id,
            endpoint: req.path,
            method: req.method,
            statusCode: 429,
            ip: req.ip,
            userAgent: req.headers['user-agent'],
            latencyMs: Date.now() - startTime
        });
        logRateLimitAudit(req, apiKey.workspaceId, apiKey.id, 'WORKSPACE_LIMIT_EXCEEDED').catch(() => void 0);

        res.status(429).json({
            error: 'Too Many Requests',
            message: 'Workspace rate limit exceeded. Please slow down.',
            retryAfter: Math.ceil(workspaceRateLimit.resetIn / 1000)
        });
        return;
    }

    // Attach key info to request
    req.apiKey = apiKey;
    req.workspaceId = apiKey.workspaceId;
    req.apiKeyId = apiKey.id;

    // Update last used timestamp (fire and forget)
    touchApiKeyUsage(apiKey.id).catch(console.error);

    // Log usage after response
    res.on('finish', () => {
        logApiUsage({
            apiKeyId: apiKey.id,
            endpoint: req.path,
            method: req.method,
            statusCode: res.statusCode,
            ip: req.ip,
            userAgent: req.headers['user-agent'],
            latencyMs: Date.now() - startTime
        }).catch(console.error);
    });

    next();
};

/**
 * Require specific scope(s) for an endpoint
 */
export const requireScope = (...scopes: string[]) => {
    return (req: ApiKeyRequest, res: Response, next: NextFunction): void => {
        if (!req.apiKey) {
            res.status(401).json({
                error: 'Unauthorized',
                message: 'API key authentication required'
            });
            return;
        }

        const missingScopes = scopes.filter(scope => !hasScope(req.apiKey!, scope));

        if (missingScopes.length > 0) {
            res.status(403).json({
                error: 'Forbidden',
                message: `Missing required scope(s): ${missingScopes.join(', ')}`,
                requiredScopes: scopes,
                grantedScopes: req.apiKey.scopes
            });
            return;
        }

        next();
    };
};

/**
 * Clean up old rate limit entries periodically
 */
setInterval(() => {
    const now = Date.now();
    for (const [keyId, state] of rateLimitMap.entries()) {
        if (now - state.windowStart > RATE_LIMIT_WINDOW_MS * 2) {
            rateLimitMap.delete(keyId);
        }
    }
    for (const [workspaceId, state] of workspaceRateLimitMap.entries()) {
        if (now - state.windowStart > RATE_LIMIT_WINDOW_MS * 2) {
            workspaceRateLimitMap.delete(workspaceId);
        }
    }
}, 60 * 1000); // Every minute
