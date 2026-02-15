"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.countRecentFailedLogins = exports.logSecurityEvent = exports.revokeSessionForActorIds = exports.listActiveSessionsForActorIds = exports.listActiveAdminSessions = exports.revokeSessionByJti = exports.revokeSession = exports.updateSessionExpiry = exports.touchSession = exports.getSessionByJti = exports.createSession = void 0;
const client_1 = require("../db/client");
const client_2 = require("@prisma/client");
const createSession = async (data) => {
    return client_1.prisma.authSession.create({
        data: {
            jti: data.jti,
            actorType: data.actorType,
            actorId: data.actorId,
            role: data.role ?? null,
            organizationId: data.organizationId ?? null,
            issuedAt: data.issuedAt,
            expiresAt: data.expiresAt,
            ipAddress: data.ipAddress,
            userAgent: data.userAgent,
            lastSeenAt: data.issuedAt
        }
    });
};
exports.createSession = createSession;
const getSessionByJti = async (jti) => {
    return client_1.prisma.authSession.findUnique({ where: { jti } });
};
exports.getSessionByJti = getSessionByJti;
const touchSession = async (jti, data) => {
    return client_1.prisma.authSession.update({
        where: { jti },
        data: {
            lastSeenAt: new Date(),
            ...(data?.ipAddress ? { ipAddress: data.ipAddress } : {}),
            ...(data?.userAgent ? { userAgent: data.userAgent } : {})
        }
    });
};
exports.touchSession = touchSession;
const updateSessionExpiry = async (jti, expiresAt) => {
    return client_1.prisma.authSession.update({
        where: { jti },
        data: { expiresAt, lastSeenAt: new Date() }
    });
};
exports.updateSessionExpiry = updateSessionExpiry;
const revokeSession = async (id) => {
    return client_1.prisma.authSession.update({
        where: { id },
        data: { revokedAt: new Date() }
    });
};
exports.revokeSession = revokeSession;
const revokeSessionByJti = async (jti) => {
    return client_1.prisma.authSession.update({
        where: { jti },
        data: { revokedAt: new Date() }
    });
};
exports.revokeSessionByJti = revokeSessionByJti;
const listActiveAdminSessions = async () => {
    const now = new Date();
    const sessions = await client_1.prisma.authSession.findMany({
        where: {
            actorType: client_2.SessionActorType.ADMIN,
            revokedAt: null,
            expiresAt: { gt: now }
        },
        orderBy: [{ lastSeenAt: 'desc' }, { issuedAt: 'desc' }]
    });
    const adminIds = sessions.map(s => s.actorId);
    const admins = await client_1.prisma.admin.findMany({
        where: { id: { in: adminIds } },
        select: { id: true, email: true, firstName: true, lastName: true, role: true }
    });
    const adminMap = new Map(admins.map(a => [a.id, a]));
    return sessions.map(session => ({
        ...session,
        admin: adminMap.get(session.actorId) || null
    }));
};
exports.listActiveAdminSessions = listActiveAdminSessions;
const listActiveSessionsForActorIds = async (actorType, actorIds) => {
    if (actorIds.length === 0)
        return [];
    const now = new Date();
    return client_1.prisma.authSession.findMany({
        where: {
            actorType,
            actorId: { in: actorIds },
            revokedAt: null,
            expiresAt: { gt: now }
        },
        orderBy: [{ lastSeenAt: 'desc' }, { issuedAt: 'desc' }]
    });
};
exports.listActiveSessionsForActorIds = listActiveSessionsForActorIds;
const revokeSessionForActorIds = async (actorType, actorIds, sessionId) => {
    const session = await client_1.prisma.authSession.findFirst({
        where: {
            id: sessionId,
            actorType,
            actorId: { in: actorIds }
        }
    });
    if (!session) {
        throw new Error('Session not found');
    }
    return client_1.prisma.authSession.update({
        where: { id: sessionId },
        data: { revokedAt: new Date() }
    });
};
exports.revokeSessionForActorIds = revokeSessionForActorIds;
const logSecurityEvent = async (data) => {
    return client_1.prisma.securityEvent.create({
        data: {
            actorType: data.actorType,
            actorId: data.actorId,
            eventType: data.eventType,
            severity: data.severity ?? client_2.SecurityEventSeverity.LOW,
            ipAddress: data.ipAddress,
            userAgent: data.userAgent,
            metadata: data.metadata ?? undefined
        }
    });
};
exports.logSecurityEvent = logSecurityEvent;
const countRecentFailedLogins = async (actorType, actorId, windowMinutes = 10) => {
    const since = new Date(Date.now() - windowMinutes * 60 * 1000);
    return client_1.prisma.securityEvent.count({
        where: {
            actorType,
            actorId,
            eventType: client_2.SecurityEventType.FAILED_LOGIN,
            createdAt: { gte: since }
        }
    });
};
exports.countRecentFailedLogins = countRecentFailedLogins;
