"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.revokeAdminSession = exports.getAdminSessions = void 0;
const session_service_1 = require("../services/session.service");
const getAdminSessions = async (req, res) => {
    try {
        const sessions = await (0, session_service_1.listActiveAdminSessions)();
        res.json(sessions);
    }
    catch (error) {
        res.status(500).json({ message: error.message || 'Failed to load sessions' });
    }
};
exports.getAdminSessions = getAdminSessions;
const revokeAdminSession = async (req, res) => {
    try {
        const { id } = req.params;
        const session = await (0, session_service_1.revokeSession)(id);
        res.json({ message: 'Session revoked', session });
    }
    catch (error) {
        res.status(400).json({ message: error.message || 'Failed to revoke session' });
    }
};
exports.revokeAdminSession = revokeAdminSession;
