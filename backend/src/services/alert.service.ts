import { prisma } from '../db/client';
import { Alert, AlertSeverity, AdminLog, AuditActionType } from '@prisma/client';
import { broadcast } from './realtime.service';

/**
 * Creates an alert and broadcasts it.
 */
export const createAlert = async (severity: AlertSeverity, title: string, message: string, adminId?: string) => {
    try {
        const alert = await prisma.alert.create({
            data: {
                severity,
                title,
                message,
                adminId
            }
        });

        // Real-Time Notification
        broadcast('ALERT', alert);

        return alert;
    } catch (error) {
        console.error('[AlertService] Failed to create alert', error);
    }
};

/**
 * Anomaly Detection Engine
 * Inspects a log entry and triggers alerts based on rules.
 */
export const checkAnomaly = async (log: AdminLog) => {
    try {
        // Rule 1: High Sensitivity Actions (Delete, Suspend)
        if (log.action === AuditActionType.DELETE || log.action === AuditActionType.SUSPEND || log.action === AuditActionType.REJECT) {
            // Check velocity: >5 critical actions in 1 minute by same admin
            const recentCriticalLogs = await prisma.adminLog.count({
                where: {
                    adminId: log.adminId,
                    action: { in: [AuditActionType.DELETE, AuditActionType.SUSPEND, AuditActionType.REJECT] },
                    createdAt: { gt: new Date(Date.now() - 60 * 1000) } // Last 1 minute
                }
            });

            if (recentCriticalLogs > 5) {
                await createAlert(
                    AlertSeverity.HIGH,
                    'Rapid Destruction Detected',
                    `Admin has performed ${recentCriticalLogs} critical actions in the last minute.`,
                    log.adminId
                );
            } else if (recentCriticalLogs === 1) {
                // Info level for single critical action? Maybe not alert, but just log.
                // Let's alert only on anomalies. 
                // But wait, user requirement says: "Rapid mass edits/deletions" -> Checked above.
            }
        }

        // Rule 2: Off-Hours Activity (11 PM - 5 AM)
        const hour = new Date(log.createdAt).getHours();
        if (hour >= 23 || hour < 5) {
            await createAlert(
                AlertSeverity.MEDIUM,
                'Off-Hours Activity',
                `Admin action performed at unusual time (${hour}:00). Action: ${log.action}`,
                log.adminId
            );
        }

        // Rule 3: Role Changes (If details contain role change keywords)
        if (log.entity === 'Admin' && log.action === AuditActionType.UPDATE && log.details?.includes('role')) {
            await createAlert(
                AlertSeverity.HIGH,
                'Privilege Escalation Attempt',
                `Admin role modification detected.`,
                log.adminId
            );
        }

    } catch (error) {
        console.error('[AlertService] Anomaly check failed', error);
    }
};

export const getAlerts = async (limit = 20) => {
    return prisma.alert.findMany({
        orderBy: { createdAt: 'desc' },
        take: limit
    });
};

export const markAsRead = async (id: string) => {
    return prisma.alert.update({
        where: { id },
        data: { isRead: true }
    });
};
