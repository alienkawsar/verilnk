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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auth_middleware_1 = require("../middleware/auth.middleware");
const restriction_middleware_1 = require("../middleware/restriction.middleware");
const orgController = __importStar(require("../controllers/organization.controller"));
const router = express_1.default.Router();
// Public Routes
router.post('/signup', orgController.signupOrganization);
router.get('/public-sitemap', orgController.getPublicSitemap);
router.get('/:id/public', orgController.getPublicProfile);
// Organization User Routes (Authenticated)
router.get('/me', auth_middleware_1.authenticateUser, orgController.getMyOrganization);
router.patch('/me', auth_middleware_1.authenticateUser, restriction_middleware_1.checkRestriction, orgController.updateMyOrganization);
// Management Routes
router.use(auth_middleware_1.authenticateAdmin);
router.get('/', (0, auth_middleware_1.authorizeRole)(['SUPER_ADMIN', 'VERIFIER', 'MODERATOR']), orgController.getOrganizations);
router.use((0, auth_middleware_1.authorizeRole)(['SUPER_ADMIN']));
router.post('/', orgController.adminCreateOrganization);
router.patch('/:id', orgController.updateOrganization);
router.delete('/:id', orgController.deleteOrganization);
router.post('/delete-bulk', orgController.deleteOrganizationsBulk);
router.patch('/:id/restrict', orgController.restrictOrganization);
router.patch('/:id/plan', orgController.updateOrganizationPlan);
router.post('/bulk-plan', orgController.bulkUpdateOrganizationPlan);
// Priority Management
router.patch('/:id/priority', orgController.updateOrganizationPriority);
router.post('/bulk-priority', orgController.bulkUpdateOrganizationPriority);
exports.default = router;
