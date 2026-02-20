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
exports.getReports = exports.createReport = void 0;
const reportService = __importStar(require("../services/report.service"));
// Helper to get IP
const getIp = (req) => {
    return (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '');
};
const createReport = async (req, res) => {
    try {
        const { siteId, reason } = req.body;
        if (!siteId || !reason) {
            res.status(400).json({ message: 'Site ID and reason are required' });
            return;
        }
        const ip = getIp(req);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const user = req.user;
        if (!user || !user.id) {
            res.status(401).json({ message: 'Unauthorized' });
            return;
        }
        await reportService.createReport(siteId, user.id, reason, ip);
        res.status(201).json({ message: 'Report submitted successfully' });
    }
    catch (error) {
        res.status(500).json({ message: 'Error submitting report' });
    }
};
exports.createReport = createReport;
const getReports = async (req, res) => {
    try {
        const reports = await reportService.getAllReports();
        res.json(reports);
    }
    catch (error) {
        res.status(500).json({ message: 'Error fetching reports' });
    }
};
exports.getReports = getReports;
