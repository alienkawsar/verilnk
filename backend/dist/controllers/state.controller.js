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
exports.deleteState = exports.updateState = exports.createState = exports.getStates = void 0;
const stateService = __importStar(require("../services/state.service"));
const getStates = async (req, res) => {
    try {
        const countryId = req.query.countryId;
        const states = await stateService.getAllStates(countryId);
        res.json(states);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getStates = getStates;
const createState = async (req, res) => {
    try {
        const { name, code, countryId } = req.body;
        if (!name || !countryId) {
            res.status(400).json({ message: 'Name and Country ID are required' });
            return;
        }
        // @ts-ignore
        const user = req.user;
        const auditContext = user ? { adminId: user.id, ip: req.ip, userAgent: req.headers['user-agent'] } : undefined;
        const state = await stateService.createState({ name, code, countryId }, auditContext);
        res.status(201).json(state);
    }
    catch (error) {
        res.status(400).json({ message: error.message });
    }
};
exports.createState = createState;
const updateState = async (req, res) => {
    try {
        const { id } = req.params;
        // @ts-ignore
        const user = req.user;
        const auditContext = user ? { adminId: user.id, ip: req.ip, userAgent: req.headers['user-agent'] } : undefined;
        const state = await stateService.updateState(id, req.body, auditContext);
        res.json(state);
    }
    catch (error) {
        res.status(400).json({ message: error.message });
    }
};
exports.updateState = updateState;
const deleteState = async (req, res) => {
    try {
        const { id } = req.params;
        // @ts-ignore
        const user = req.user;
        const auditContext = user ? { adminId: user.id, ip: req.ip, userAgent: req.headers['user-agent'] } : undefined;
        await stateService.deleteState(id, auditContext);
        res.json({ message: 'State deleted successfully' });
    }
    catch (error) {
        res.status(400).json({ message: error.message });
    }
};
exports.deleteState = deleteState;
