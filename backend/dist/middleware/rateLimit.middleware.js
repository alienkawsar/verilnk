"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.voiceRateLimiter = exports.uploadRateLimiter = exports.searchRateLimiter = exports.strictRateLimiter = exports.globalRateLimiter = void 0;
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
exports.globalRateLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // Limit each IP to 1000 requests per windowMs
    message: 'Too many requests from this IP, please try again later',
    standardHeaders: true,
    legacyHeaders: false,
});
exports.strictRateLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 50, // Limit each IP to 50 requests per windowMs
    message: 'Too many attempts from this IP, please try again later',
    standardHeaders: true,
    legacyHeaders: false,
});
exports.searchRateLimiter = (0, express_rate_limit_1.default)({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 120, // burst-friendly but controlled
    message: 'Too many search requests. Please slow down.',
    standardHeaders: true,
    legacyHeaders: false,
});
exports.uploadRateLimiter = (0, express_rate_limit_1.default)({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 40,
    message: 'Too many upload requests. Please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
});
exports.voiceRateLimiter = (0, express_rate_limit_1.default)({
    windowMs: 10 * 60 * 1000, // 10 minutes
    max: 60,
    message: 'Too many voice requests. Please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
});
