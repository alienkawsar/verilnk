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
exports.updateUsersBulk = exports.deleteUsersBulk = exports.restrictUser = exports.deleteUser = exports.updateUser = exports.createUser = exports.getUsers = void 0;
const userService = __importStar(require("../services/user.service"));
const zod_1 = require("zod");
const passwordPolicy_1 = require("../utils/passwordPolicy");
const client_1 = require("../db/client");
const createUserSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().regex(passwordPolicy_1.STRONG_PASSWORD_REGEX, passwordPolicy_1.STRONG_PASSWORD_MESSAGE),
    firstName: zod_1.z.string().min(1),
    lastName: zod_1.z.string().min(1),
    country: zod_1.z.string().optional(),
    dailyRequestLimit: zod_1.z.number().nullable().optional(),
    requestLimit: zod_1.z.number().nullable().optional(),
    requestLimitWindow: zod_1.z.number().optional()
});
const updateUserSchema = zod_1.z.object({
    email: zod_1.z.string().email().optional(),
    firstName: zod_1.z.string().min(1).optional(),
    lastName: zod_1.z.string().min(1).optional(),
    country: zod_1.z.string().optional(),
    password: zod_1.z.string().regex(passwordPolicy_1.STRONG_PASSWORD_REGEX, passwordPolicy_1.STRONG_PASSWORD_MESSAGE).optional(),
    isRestricted: zod_1.z.boolean().optional(),
    dailyRequestLimit: zod_1.z.number().nullable().optional(), // Nullable for unlimited
    requestLimit: zod_1.z.number().nullable().optional(),
    requestLimitWindow: zod_1.z.number().optional()
});
const isGlobalCountryValue = async (value) => {
    if (!value)
        return false;
    const normalized = value.trim().toUpperCase();
    if (normalized === 'GLOBAL' || normalized === 'GL' || normalized === 'WW') {
        return true;
    }
    const asUuid = zod_1.z.string().uuid().safeParse(value);
    if (!asUuid.success)
        return false;
    const country = await client_1.prisma.country.findUnique({
        where: { id: value },
        select: { code: true, name: true }
    });
    const code = String(country?.code || '').trim().toUpperCase();
    const name = String(country?.name || '').trim().toUpperCase();
    return code === 'GL' || code === 'WW' || name === 'GLOBAL';
};
const getUsers = async (req, res) => {
    try {
        const { country, stateId, categoryId, type } = req.query;
        const filters = {
            country: country, // Expecting country code (e.g. "US") or ID if User stores ID. User schema says String?
            stateId: stateId,
            categoryId: categoryId,
            type: type
        };
        const users = await userService.getAllUsers(filters);
        res.json(users);
    }
    catch (error) {
        res.status(500).json({ message: 'Error fetching users' });
    }
};
exports.getUsers = getUsers;
const createUser = async (req, res) => {
    try {
        const data = createUserSchema.parse(req.body);
        if (await isGlobalCountryValue(data.country)) {
            res.status(400).json({
                code: 'INVALID_COUNTRY',
                message: 'Global is not allowed for user country'
            });
            return;
        }
        // @ts-ignore
        const user = req.user;
        const auditContext = user ? { adminId: user.id, ip: req.ip, userAgent: req.headers['user-agent'] } : undefined;
        const newUser = await userService.createUser(data, auditContext);
        res.status(201).json(newUser);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            res.status(400).json({ errors: error.issues });
            return;
        }
        res.status(400).json({ message: error.message || 'Error creating user' });
    }
};
exports.createUser = createUser;
const updateUser = async (req, res) => {
    try {
        const { id } = req.params;
        const data = updateUserSchema.parse(req.body);
        if (await isGlobalCountryValue(data.country)) {
            res.status(400).json({
                code: 'INVALID_COUNTRY',
                message: 'Global is not allowed for user country'
            });
            return;
        }
        // @ts-ignore
        const requester = req.user;
        const auditContext = requester ? { adminId: requester.id, ip: req.ip, userAgent: req.headers['user-agent'] } : undefined;
        const user = await userService.updateUser(id, data, auditContext);
        res.json(user);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            res.status(400).json({ errors: error.issues });
            return;
        }
        res.status(400).json({ message: error.message || 'Error updating user' });
    }
};
exports.updateUser = updateUser;
const deleteUser = async (req, res) => {
    try {
        const { id } = req.params;
        // @ts-ignore
        const requester = req.user;
        const auditContext = requester ? { adminId: requester.id, ip: req.ip, userAgent: req.headers['user-agent'] } : undefined;
        await userService.deleteUser(id, auditContext);
        res.json({ message: 'User deleted successfully' });
    }
    catch (error) {
        res.status(400).json({ message: error.message || 'Error deleting user' });
    }
};
exports.deleteUser = deleteUser;
const auditService = __importStar(require("../services/audit.service"));
const client_2 = require("@prisma/client");
const restrictUser = async (req, res) => {
    try {
        const { id } = req.params;
        const { isRestricted } = req.body;
        // @ts-ignore
        const adminId = req.user.id;
        let restrictedBool;
        if (typeof isRestricted === 'boolean') {
            restrictedBool = isRestricted;
        }
        else if (isRestricted === 'true') {
            restrictedBool = true;
        }
        else if (isRestricted === 'false') {
            restrictedBool = false;
        }
        else {
            res.status(400).json({ message: 'isRestricted must be a boolean or boolean string' });
            return;
        }
        const user = await userService.restrictUser(id, restrictedBool);
        auditService.logAction({
            adminId,
            action: client_2.AuditActionType.SUSPEND,
            entity: 'User',
            targetId: id,
            details: `User restriction set to: ${restrictedBool}`,
            snapshot: { isRestricted: restrictedBool },
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
        });
        res.json(user);
    }
    catch (error) {
        res.status(400).json({ message: error.message || 'Error updating user restriction' });
    }
};
exports.restrictUser = restrictUser;
const deleteUsersBulk = async (req, res) => {
    try {
        const { ids } = req.body;
        if (!Array.isArray(ids) || ids.length === 0) {
            res.status(400).json({ message: 'Invalid or empty IDs array' });
            return;
        }
        // @ts-ignore
        const requester = req.user;
        const auditContext = requester ? { adminId: requester.id, ip: req.ip, userAgent: req.headers['user-agent'] } : undefined;
        await userService.deleteUsers(ids, auditContext);
        res.json({ message: 'Users deleted successfully' });
    }
    catch (error) {
        res.status(500).json({ message: error.message || 'Error deleting users' });
    }
};
exports.deleteUsersBulk = deleteUsersBulk;
const updateUsersBulk = async (req, res) => {
    try {
        const { ids, data } = req.body;
        if (!Array.isArray(ids) || ids.length === 0) {
            res.status(400).json({ message: 'Invalid or empty IDs array' });
            return;
        }
        if (!data || typeof data !== 'object') {
            res.status(400).json({ message: 'Invalid data object' });
            return;
        }
        // @ts-ignore
        const requester = req.user;
        const auditContext = requester ? { adminId: requester.id, ip: req.ip, userAgent: req.headers['user-agent'] } : undefined;
        await userService.updateUsersBulk(ids, data, auditContext);
        res.json({ message: 'Users updated successfully' });
    }
    catch (error) {
        res.status(500).json({ message: error.message || 'Error updating users' });
    }
};
exports.updateUsersBulk = updateUsersBulk;
