"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.markAsRead = exports.getAlerts = exports.checkAnomaly = exports.createAlert = void 0;
const client_1 = require("../db/client");
const client_2 = require("@prisma/client");
const realtime_service_1 = require("./realtime.service");
/**
 * Creates an alert and broadcasts it.
 */
const createAlert = async (severity, title, message, adminId) => {
    try {
        const alert = await client_1.prisma.alert.create({
            data: {
                severity,
                title,
                message,
                adminId
            }
        });
        // Real-Time Notification
        (0, realtime_service_1.broadcast)('ALERT', alert);
        return alert;
    }
    catch (error) {
        console.error('[AlertService] Failed to create alert', error);
    }
};
exports.createAlert = createAlert;
/**
 * Anomaly Detection Engine
 * Inspects a log entry and triggers alerts based on rules.
 */
const checkAnomaly = async (log) => {
    try {
        // Rule 1: High Sensitivity Actions (Delete, Suspend)
        if (log.action === client_2.AuditActionType.DELETE || log.action === client_2.AuditActionType.SUSPEND || log.action === client_2.AuditActionType.REJECT) {
            // Check velocity: >5 critical actions in 1 minute by same admin
            const recentCriticalLogs = await client_1.prisma.adminLog.count({
                where: {
                    adminId: log.adminId,
                    action: { in: [client_2.AuditActionType.DELETE, client_2.AuditActionType.SUSPEND, client_2.AuditActionType.REJECT] },
                    createdAt: { gt: new Date(Date.now() - 60 * 1000) } // Last 1 minute
                }
            });
            if (recentCriticalLogs > 5) {
                await (0, exports.createAlert)(client_2.AlertSeverity.HIGH, 'Rapid Destruction Detected', `Admin has performed ${recentCriticalLogs} critical actions in the last minute.`, log.adminId);
            }
            else if (recentCriticalLogs === 1) {
                // Info level for single critical action? Maybe not alert, but just log.
                // Let's alert only on anomalies. 
                // But wait, user requirement says: "Rapid mass edits/deletions" -> Checked above.
            }
        }
        // Rule 2: Off-Hours Activity (11 PM - 5 AM)
        const hour = new Date(log.createdAt).getHours();
        if (hour >= 23 || hour < 5) {
            await (0, exports.createAlert)(client_2.AlertSeverity.MEDIUM, 'Off-Hours Activity', `Admin action performed at unusual time (${hour}:00). Action: ${log.action}`, log.adminId);
        }
        // Rule 3: Role Changes (If details contain role change keywords)
        if (log.entity === 'Admin' && log.action === client_2.AuditActionType.UPDATE && log.details?.includes('role')) {
            await (0, exports.createAlert)(client_2.AlertSeverity.HIGH, 'Privilege Escalation Attempt', `Admin role modification detected.`, log.adminId);
        }
    }
    catch (error) {
        console.error('[AlertService] Anomaly check failed', error);
    }
};
exports.checkAnomaly = checkAnomaly;
const getAlerts = async (limit = 20) => {
    return client_1.prisma.alert.findMany({
        orderBy: { createdAt: 'desc' },
        take: limit
    });
};
exports.getAlerts = getAlerts;
const markAsRead = async (id) => {
    return client_1.prisma.alert.update({
        where: { id },
        data: { isRead: true }
    });
};
exports.markAsRead = markAsRead;
