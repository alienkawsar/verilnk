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
const express_1 = require("express");
const requestController = __importStar(require("../controllers/request.controller"));
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = (0, express_1.Router)();
const restriction_middleware_1 = require("../middleware/restriction.middleware");
// Create Request (Authenticated Users/Orgs)
router.post('/', auth_middleware_1.authenticateUser, restriction_middleware_1.checkRestriction, requestController.createRequest);
// User/Org Requests (self)
router.get('/my', auth_middleware_1.authenticateUser, requestController.getRequests);
// Admin Routes
router.get('/', auth_middleware_1.authenticateAdmin, requestController.getRequests);
router.post('/:id/approve', auth_middleware_1.authenticateAdmin, (0, auth_middleware_1.authorizeRole)(['SUPER_ADMIN', 'MODERATOR', 'VERIFIER']), requestController.approveRequest);
router.post('/:id/reject', auth_middleware_1.authenticateAdmin, (0, auth_middleware_1.authorizeRole)(['SUPER_ADMIN', 'MODERATOR', 'VERIFIER']), requestController.rejectRequest);
// Bulk Actions
router.post('/bulk-approve', auth_middleware_1.authenticateAdmin, (0, auth_middleware_1.authorizeRole)(['SUPER_ADMIN', 'MODERATOR', 'VERIFIER']), requestController.bulkApprove);
router.post('/bulk-reject', auth_middleware_1.authenticateAdmin, (0, auth_middleware_1.authorizeRole)(['SUPER_ADMIN', 'MODERATOR', 'VERIFIER']), requestController.bulkReject);
exports.default = router;
