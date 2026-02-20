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
exports.exportAuditLogs = exports.getAuditAnalytics = exports.getAuditLogs = void 0;
const auditService = __importStar(require("../services/audit.service"));
const getAuditLogs = async (req, res) => {
    try {
        const { page, limit, adminId, action, entity, startDate, endDate } = req.query;
        const filters = {
            adminId: adminId,
            action: action,
            entity: entity,
            startDate: startDate ? new Date(startDate) : undefined,
            endDate: endDate ? new Date(endDate) : undefined
        };
        const result = await auditService.getLogs(Number(page) || 1, Number(limit) || 20, filters);
        res.json(result);
    }
    catch (error) {
        console.error('Error fetching audit logs:', error);
        res.status(500).json({ message: 'Error fetching audit logs' });
    }
};
exports.getAuditLogs = getAuditLogs;
const getAuditAnalytics = async (req, res) => {
    try {
        const result = await auditService.getAnalytics();
        res.json(result);
    }
    catch (error) {
        console.error('Error fetching audit analytics:', error);
        res.status(500).json({ message: 'Error fetching audit analytics' });
    }
};
exports.getAuditAnalytics = getAuditAnalytics;
const exportAuditLogs = async (req, res) => {
    try {
        const { startDate, endDate, format } = req.query;
        const filters = {
            startDate: startDate ? new Date(startDate) : undefined,
            endDate: endDate ? new Date(endDate) : undefined
        };
        if (format === 'json') {
            const data = await auditService.exportLogsJson(filters);
            res.header('Content-Type', 'application/json');
            res.send(data);
            return;
        }
        const csvData = await auditService.exportLogs(filters);
        res.header('Content-Type', 'text/csv');
        res.attachment(`audit_logs_${new Date().toISOString().split('T')[0]}.csv`);
        res.send(csvData);
    }
    catch (error) {
        console.error('Error exporting audit logs:', error);
        res.status(500).json({ message: 'Error exporting logs' });
    }
};
exports.exportAuditLogs = exportAuditLogs;
