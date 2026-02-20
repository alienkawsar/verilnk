"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const supertest_1 = __importDefault(require("supertest"));
const app_1 = __importDefault(require("../app"));
(0, vitest_1.describe)('Health endpoint', () => {
    (0, vitest_1.it)('responds with 200', async () => {
        const res = await (0, supertest_1.default)(app_1.default).get('/health');
        (0, vitest_1.expect)(res.status).toBe(200);
    });
});
(0, vitest_1.describe)('Auth guard', () => {
    (0, vitest_1.it)('rejects unauthenticated /api/auth/me', async () => {
        const res = await (0, supertest_1.default)(app_1.default).get('/api/auth/me');
        (0, vitest_1.expect)(res.status).toBe(401);
    });
});
