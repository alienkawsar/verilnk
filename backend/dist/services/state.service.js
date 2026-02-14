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
exports.deleteState = exports.updateState = exports.createState = exports.getStateById = exports.getAllStates = void 0;
const client_1 = require("../db/client");
const client_2 = require("@prisma/client");
const auditService = __importStar(require("./audit.service"));
const getAllStates = async (countryId) => {
    return client_1.prisma.state.findMany({
        where: countryId ? { countryId } : {},
        orderBy: { name: 'asc' },
        include: { country: true }
    });
};
exports.getAllStates = getAllStates;
const getStateById = async (id) => {
    return client_1.prisma.state.findUnique({
        where: { id },
        include: { country: true }
    });
};
exports.getStateById = getStateById;
const createState = async (data, auditContext) => {
    // Check uniqueness within country
    const existing = await client_1.prisma.state.findFirst({
        where: {
            name: data.name,
            countryId: data.countryId
        }
    });
    if (existing) {
        throw new Error(`State "${data.name}" already exists in this country`);
    }
    const state = await client_1.prisma.state.create({
        data
    });
    if (auditContext) {
        auditService.logAction({
            adminId: auditContext.adminId,
            action: client_2.AuditActionType.CREATE,
            entity: 'State',
            targetId: state.id,
            details: `Created state ${state.name} in country ${state.countryId}`,
            snapshot: state,
            ipAddress: auditContext.ip,
            userAgent: auditContext.userAgent
        });
    }
    return state;
};
exports.createState = createState;
const updateState = async (id, data, auditContext) => {
    if (data.name && data.countryId) {
        const existing = await client_1.prisma.state.findFirst({
            where: {
                name: data.name,
                countryId: data.countryId,
                NOT: { id }
            }
        });
        if (existing) {
            throw new Error(`State "${data.name}" already exists in this country`);
        }
    }
    const beforeState = await client_1.prisma.state.findUnique({ where: { id } });
    const state = await client_1.prisma.state.update({
        where: { id },
        data
    });
    if (auditContext) {
        auditService.logAction({
            adminId: auditContext.adminId,
            action: client_2.AuditActionType.UPDATE,
            entity: 'State',
            targetId: state.id,
            details: `Updated state ${state.name}`,
            snapshot: { before: beforeState, after: state },
            ipAddress: auditContext.ip,
            userAgent: auditContext.userAgent
        });
    }
    return state;
};
exports.updateState = updateState;
const deleteState = async (id, auditContext) => {
    // Check dependencies (Sites)
    const sitesCount = await client_1.prisma.site.count({
        where: { stateId: id }
    });
    if (sitesCount > 0) {
        throw new Error(`Cannot delete state with ${sitesCount} associated sites`);
    }
    const beforeState = await client_1.prisma.state.findUnique({ where: { id } });
    const state = await client_1.prisma.state.delete({
        where: { id }
    });
    if (auditContext && beforeState) {
        auditService.logAction({
            adminId: auditContext.adminId,
            action: client_2.AuditActionType.DELETE,
            entity: 'State',
            targetId: state.id,
            details: `Deleted state ${state.name}`,
            snapshot: beforeState,
            ipAddress: auditContext.ip,
            userAgent: auditContext.userAgent
        });
    }
    return state;
};
exports.deleteState = deleteState;
