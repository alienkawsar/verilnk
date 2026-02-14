import { prisma } from '../db/client';
import { SessionActorType, SecurityEventType, SecurityEventSeverity, AdminRole } from '@prisma/client';

export const createSession = async (data: {
    jti: string;
    actorType: SessionActorType;
    actorId: string;
    role?: AdminRole | null;
    organizationId?: string | null;
    issuedAt: Date;
    expiresAt: Date;
    ipAddress?: string;
    userAgent?: string;
}) => {
    return prisma.authSession.create({
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

export const getSessionByJti = async (jti: string) => {
    return prisma.authSession.findUnique({ where: { jti } });
};

export const touchSession = async (jti: string, data?: { ipAddress?: string; userAgent?: string }) => {
    return prisma.authSession.update({
        where: { jti },
        data: {
            lastSeenAt: new Date(),
            ...(data?.ipAddress ? { ipAddress: data.ipAddress } : {}),
            ...(data?.userAgent ? { userAgent: data.userAgent } : {})
        }
    });
};

export const updateSessionExpiry = async (jti: string, expiresAt: Date) => {
    return prisma.authSession.update({
        where: { jti },
        data: { expiresAt, lastSeenAt: new Date() }
    });
};

export const revokeSession = async (id: string) => {
    return prisma.authSession.update({
        where: { id },
        data: { revokedAt: new Date() }
    });
};

export const revokeSessionByJti = async (jti: string) => {
    return prisma.authSession.update({
        where: { jti },
        data: { revokedAt: new Date() }
    });
};

export const listActiveAdminSessions = async () => {
    const now = new Date();
    const sessions = await prisma.authSession.findMany({
        where: {
            actorType: SessionActorType.ADMIN,
            revokedAt: null,
            expiresAt: { gt: now }
        },
        orderBy: [{ lastSeenAt: 'desc' }, { issuedAt: 'desc' }]
    });

    const adminIds = sessions.map(s => s.actorId);
    const admins = await prisma.admin.findMany({
        where: { id: { in: adminIds } },
        select: { id: true, email: true, firstName: true, lastName: true, role: true }
    });
    const adminMap = new Map(admins.map(a => [a.id, a]));

    return sessions.map(session => ({
        ...session,
        admin: adminMap.get(session.actorId) || null
    }));
};

export const logSecurityEvent = async (data: {
    actorType: SessionActorType;
    actorId: string;
    eventType: SecurityEventType;
    severity?: SecurityEventSeverity;
    ipAddress?: string;
    userAgent?: string;
    metadata?: any;
}) => {
    return prisma.securityEvent.create({
        data: {
            actorType: data.actorType,
            actorId: data.actorId,
            eventType: data.eventType,
            severity: data.severity ?? SecurityEventSeverity.LOW,
            ipAddress: data.ipAddress,
            userAgent: data.userAgent,
            metadata: data.metadata ?? undefined
        }
    });
};

export const countRecentFailedLogins = async (actorType: SessionActorType, actorId: string, windowMinutes = 10) => {
    const since = new Date(Date.now() - windowMinutes * 60 * 1000);
    return prisma.securityEvent.count({
        where: {
            actorType,
            actorId,
            eventType: SecurityEventType.FAILED_LOGIN,
            createdAt: { gte: since }
        }
    });
};
