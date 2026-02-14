"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const zod_1 = require("zod");
const client_1 = require("@prisma/client");
const auth_middleware_1 = require("../middleware/auth.middleware");
const role_guard_1 = require("../middleware/role.guard");
const router = express_1.default.Router();
const prisma = new client_1.PrismaClient();
const reportSchema = zod_1.z.object({
    siteId: zod_1.z.string().uuid('Invalid Site ID'),
    reason: zod_1.z.string().trim().min(1, 'Report message is required.'),
});
// Create Report
router.post('/', auth_middleware_1.authenticateUser, async (req, res) => {
    try {
        const { siteId, reason } = reportSchema.parse(req.body);
        const userId = req.user.id;
        // Check if site exists
        const site = await prisma.site.findUnique({ where: { id: siteId } });
        if (!site || site.deletedAt) {
            return res.status(404).json({ message: 'Site not found' });
        }
        // Check for duplicate report
        const existingReport = await prisma.report.findFirst({
            where: {
                siteId,
                userId,
                deletedAt: null
            },
        });
        if (existingReport) {
            return res.status(400).json({ message: 'You have already reported this site' });
        }
        const report = await prisma.report.create({
            data: {
                siteId,
                userId,
                reason,
            },
        });
        res.status(201).json({ message: 'Report submitted successfully', report });
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            const reasonIssue = error.issues.find((issue) => issue.path?.[0] === 'reason');
            if (reasonIssue) {
                return res.status(400).json({ message: 'Report message is required.' });
            }
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return res.status(400).json({ errors: error.errors });
        }
        console.error(error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
// Get Reports (Admin only - for now just protected, TODO: Add admin check)
// Assuming authenticateUser just checks for valid token. 
// Ideally we should have checkAdmin middleware, but for now I'll just check if user exists.
// The requirements say "Fully working login/signup system", "Admin Dashboard -> Report Page".
// I'll add a check for admin role if I can, or just keep it open for now as requested "Admin Dashboard" is authenticated.
// Actually, I should probably check for admin role. 
// Looking at schema, Admin is a separate model? Or User has role?
// Schema: Admin model exists. User model checks regular users.
// IF logic: Admin dashboard uses Admin model auth?
// The prompt says: "Feature 1: User Login/Signup". "Feature 2: Report... Admin Dashboard".
// Does the USER login to Admin Dashboard? Usually separate.
// "Admin Dashboard -> Add Report Page / Tab"
// I will assume for now that I need to expose an endpoint to get reports. 
// Since I don't see shared auth between User and Admin in the schema (Admin is separate table),
// I will just make a public-ish endpoint or reuse the new User auth if the requirement meant "User Dashboard".
// EXCEPT: "Admin Dashboard -> Report Page". "Admin can mark report...".
// Existing Admin Dashboard likely has its own auth.
// I'll check `admin.routes.ts` or similar if it exists.
router.get('/', auth_middleware_1.authenticateAdmin, async (req, res) => {
    // TODO: Add Admin Authentication Middleware
    try {
        const reports = await prisma.report.findMany({
            where: { deletedAt: null },
            include: {
                site: true,
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
            },
            orderBy: {
                createdAt: 'desc',
            },
        });
        res.json(reports);
    }
    catch (error) {
        res.status(500).json({ message: 'Internal server error' });
    }
});
// Delete Report (Admin only)
router.delete('/:id', auth_middleware_1.authenticateAdmin, (0, role_guard_1.authorizeRole)(['SUPER_ADMIN', 'MODERATOR', 'VERIFIER']), async (req, res) => {
    try {
        const { id } = req.params;
        // Check if report exists
        const report = await prisma.report.findUnique({ where: { id: id } });
        if (!report) {
            return res.status(404).json({ message: 'Report not found' });
        }
        await prisma.report.update({
            where: { id: id },
            data: { deletedAt: new Date() }
        });
        res.json({ message: 'Report removed successfully' });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
exports.default = router;
