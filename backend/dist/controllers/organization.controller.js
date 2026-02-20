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
exports.bulkUpdateOrganizationPlan = exports.updateOrganizationPlan = exports.bulkUpdateOrganizationPriority = exports.updateOrganizationPriority = exports.permanentlyDeleteOrganization = exports.restoreOrganization = exports.deleteOrganizationsBulk = exports.restrictOrganization = exports.deleteOrganization = exports.updateOrganization = exports.getPublicSitemap = exports.getPublicProfile = exports.updateMyOrganization = exports.adminCreateOrganization = exports.downloadMyOrganizationInvoicePdf = exports.getMyOrganization = exports.getOrganizations = exports.signupOrganization = void 0;
const orgService = __importStar(require("../services/organization.service"));
const requestService = __importStar(require("../services/request.service"));
const client_1 = require("../db/client");
const zod_1 = require("zod");
const client_2 = require("@prisma/client");
const recaptcha_service_1 = require("../services/recaptcha.service");
const entitlement_service_1 = require("../services/entitlement.service");
const passwordPolicy_1 = require("../utils/passwordPolicy");
const invoice_pdf_service_1 = require("../services/invoice-pdf.service");
const invoice_filename_service_1 = require("../services/invoice-filename.service");
const orgSignupSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().regex(passwordPolicy_1.STRONG_PASSWORD_REGEX, passwordPolicy_1.STRONG_PASSWORD_MESSAGE),
    orgName: zod_1.z.string().min(1),
    website: zod_1.z.string().url(),
    phone: zod_1.z.string().min(1),
    address: zod_1.z.string().min(1),
    countryId: zod_1.z.string().uuid(),
    stateId: zod_1.z.string().optional(),
    categoryId: zod_1.z.string().uuid(),
    type: zod_1.z.enum(['PUBLIC', 'PRIVATE', 'NON_PROFIT']),
    about: zod_1.z.string().optional(),
    logo: zod_1.z.string().optional(),
    captchaToken: zod_1.z.string().optional(),
    captchaAction: zod_1.z.string().optional()
});
// ... existing code
const signupOrganization = async (req, res) => {
    try {
        const data = orgSignupSchema.parse(req.body);
        // Verify Captcha
        if (data.captchaToken) {
            const isHuman = await (0, recaptcha_service_1.verifyCaptcha)(data.captchaToken, 'org_signup');
            if (!isHuman) {
                res.status(400).json({ message: 'Invalid CAPTCHA' });
                return;
            }
        }
        else if (process.env.NODE_ENV === 'production') {
            res.status(400).json({ message: 'CAPTCHA required' });
            return;
        }
        // Remove captchaToken from data passed to service if service is strict, or just pass it (service acts on known fields)
        // Ideally remove it.
        const { captchaToken, captchaAction, ...serviceData } = data;
        const result = await orgService.signupOrganization(serviceData);
        res.status(201).json(result);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            res.status(400).json({ errors: error.issues });
            return;
        }
        res.status(400).json({ message: error.message || 'Error signing up organization' });
    }
};
exports.signupOrganization = signupOrganization;
const updateOrgSchema = zod_1.z.object({
    name: zod_1.z.string().optional(),
    email: zod_1.z.string().email().optional(),
    website: zod_1.z.string().url().optional(),
    phone: zod_1.z.string().optional(),
    address: zod_1.z.string().optional(),
    status: zod_1.z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
    type: zod_1.z.enum(['PUBLIC', 'PRIVATE', 'NON_PROFIT']).optional(),
    about: zod_1.z.string().optional(),
    logo: zod_1.z.string().optional(),
    countryId: zod_1.z.string().uuid().optional(),
    stateId: zod_1.z.union([zod_1.z.string().uuid(), zod_1.z.string().length(0), zod_1.z.null()]).optional(),
    categoryId: zod_1.z.union([zod_1.z.string().uuid(), zod_1.z.string().length(0), zod_1.z.null()]).optional(),
    priority: zod_1.z.preprocess((value) => (typeof value === 'string' ? value.trim().toUpperCase() : value), zod_1.z.enum(['HIGH', 'MEDIUM', 'NORMAL', 'LOW'])).optional(),
    isRestricted: zod_1.z.boolean().optional()
});
const updatePlanSchema = zod_1.z.object({
    planType: zod_1.z.nativeEnum(client_2.PlanType),
    planStatus: zod_1.z.nativeEnum(client_2.PlanStatus),
    durationDays: zod_1.z.number().int().nonnegative().optional(),
    priorityOverride: zod_1.z.number().int().optional().nullable(),
    enterpriseMaxWorkspaces: zod_1.z.number().int().min(1).max(1000000).optional().nullable(),
    enterpriseMaxLinkedOrgs: zod_1.z.number().int().min(1).max(1000000).optional().nullable(),
    enterpriseMaxApiKeys: zod_1.z.number().int().min(1).max(1000000).optional().nullable(),
    enterpriseMaxMembers: zod_1.z.number().int().min(1).max(1000000).optional().nullable()
});
const BILLING_TERM_VALUES = ['MONTHLY', 'ANNUAL'];
const ORG_PRIORITY_VALUES = ['HIGH', 'MEDIUM', 'NORMAL', 'LOW'];
const adminCreateOrgSchema = zod_1.z.object({
    name: zod_1.z.string().min(1),
    email: zod_1.z.string().email(),
    password: zod_1.z.string().regex(passwordPolicy_1.STRONG_PASSWORD_REGEX, passwordPolicy_1.STRONG_PASSWORD_MESSAGE),
    website: zod_1.z.string().url(),
    phone: zod_1.z.string().min(1),
    address: zod_1.z.string().min(1),
    countryId: zod_1.z.string().uuid(),
    categoryId: zod_1.z.string().uuid(),
    stateId: zod_1.z.string().uuid().optional(),
    type: zod_1.z.enum(['PUBLIC', 'PRIVATE', 'NON_PROFIT']).optional(),
    about: zod_1.z.string().optional(),
    logo: zod_1.z.string().optional(),
    planType: zod_1.z.nativeEnum(client_2.PlanType).optional(),
    planStatus: zod_1.z.nativeEnum(client_2.PlanStatus).optional(),
    durationDays: zod_1.z.number().int().nonnegative().optional(),
    billingTerm: zod_1.z.enum(BILLING_TERM_VALUES).optional(),
    amountCents: zod_1.z.number().int().positive().optional(),
    // Discovery note (backend/src/controllers/organization.controller.ts):
    // Create payload priority was previously omitted from this schema and dropped before service write.
    priority: zod_1.z.preprocess((value) => (typeof value === 'string' ? value.trim().toUpperCase() : value), zod_1.z.enum(ORG_PRIORITY_VALUES)).optional(),
    priorityOverride: zod_1.z.number().int().optional().nullable(),
    enterpriseMaxWorkspaces: zod_1.z.number().int().min(1).max(1000000).optional().nullable(),
    enterpriseMaxLinkedOrgs: zod_1.z.number().int().min(1).max(1000000).optional().nullable(),
    enterpriseMaxApiKeys: zod_1.z.number().int().min(1).max(1000000).optional().nullable(),
    enterpriseMaxMembers: zod_1.z.number().int().min(1).max(1000000).optional().nullable()
});
const getOrganizationsQuerySchema = zod_1.z.object({
    countryId: zod_1.z.string().uuid().optional(),
    stateId: zod_1.z.string().uuid().optional(),
    categoryId: zod_1.z.string().uuid().optional(),
    status: zod_1.z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
    type: zod_1.z.enum(['PUBLIC', 'PRIVATE', 'NON_PROFIT']).optional(),
    priority: zod_1.z.enum(['HIGH', 'MEDIUM', 'NORMAL', 'LOW']).optional(),
    planType: zod_1.z.nativeEnum(client_2.PlanType).optional(),
    deleted: zod_1.z.enum(['only', 'include', 'exclude']).optional()
});
const normalizeQueryValue = (value) => {
    if (typeof value !== 'string')
        return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
};
const getOrganizations = async (req, res) => {
    try {
        const parsed = getOrganizationsQuerySchema.safeParse({
            countryId: normalizeQueryValue(req.query.countryId),
            stateId: normalizeQueryValue(req.query.stateId),
            categoryId: normalizeQueryValue(req.query.categoryId),
            status: normalizeQueryValue(req.query.status),
            type: normalizeQueryValue(req.query.type),
            priority: normalizeQueryValue(req.query.priority),
            planType: normalizeQueryValue(req.query.planType),
            deleted: normalizeQueryValue(req.query.deleted)
        });
        if (!parsed.success) {
            res.status(400).json({ errors: parsed.error.issues });
            return;
        }
        const filters = {
            ...parsed.data,
            deleted: parsed.data.deleted ?? 'exclude'
        };
        const orgs = await orgService.getAllOrganizations(filters);
        res.json(orgs);
    }
    catch (error) {
        console.error('[Organizations] getOrganizations error:', {
            message: error?.message,
            code: error?.code,
            stack: error?.stack
        });
        res.status(500).json({ message: 'Error fetching organizations' });
    }
};
exports.getOrganizations = getOrganizations;
const getMyOrganization = async (req, res) => {
    try {
        const userId = req.user.id;
        const user = await client_1.prisma.user.findUnique({
            where: { id: userId },
            include: {
                organization: {
                    include: {
                        analytics: true,
                        country: true,
                        state: true,
                        category: true,
                        billingAccount: {
                            include: {
                                invoices: {
                                    orderBy: { createdAt: 'desc' },
                                    take: 10
                                },
                                subscriptions: {
                                    orderBy: { createdAt: 'desc' },
                                    take: 1
                                },
                                trials: {
                                    orderBy: { createdAt: 'desc' },
                                    take: 1
                                }
                            }
                        }
                    }
                }
            }
        });
        if (!user?.organization) {
            res.status(404).json({ message: 'Organization not found' });
            return;
        }
        if (user.organization.deletedAt) {
            res.status(404).json({ message: 'Organization not found' });
            return;
        }
        const { entitlements, organization, wasUpdated } = await (0, entitlement_service_1.resolveOrganizationEntitlements)(user.organization);
        const orgResponse = wasUpdated ? { ...user.organization, ...organization } : user.organization;
        const linkedEnterpriseWorkspace = await client_1.prisma.workspaceOrganization.findFirst({
            where: { organizationId: orgResponse.id },
            orderBy: { createdAt: 'asc' },
            select: {
                workspaceId: true,
                workspace: {
                    select: {
                        id: true,
                        name: true
                    }
                }
            }
        });
        res.json({
            ...orgResponse,
            entitlements,
            linkedEnterpriseWorkspace: linkedEnterpriseWorkspace
                ? {
                    id: linkedEnterpriseWorkspace.workspace?.id || linkedEnterpriseWorkspace.workspaceId,
                    name: linkedEnterpriseWorkspace.workspace?.name || linkedEnterpriseWorkspace.workspaceId
                }
                : null
        });
    }
    catch (error) {
        res.status(500).json({ message: 'Error fetching organization' });
    }
};
exports.getMyOrganization = getMyOrganization;
const downloadMyOrganizationInvoicePdf = async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            res.status(401).json({ message: 'Unauthorized' });
            return;
        }
        const user = await client_1.prisma.user.findUnique({
            where: { id: userId },
            select: { organizationId: true }
        });
        if (!user?.organizationId) {
            res.status(403).json({ message: 'Organization user required' });
            return;
        }
        const invoiceId = req.params.invoiceId;
        const invoice = await client_1.prisma.invoice.findFirst({
            where: {
                id: invoiceId,
                billingAccount: {
                    organizationId: user.organizationId
                }
            },
            include: {
                billingAccount: {
                    include: {
                        organization: {
                            select: {
                                id: true,
                                name: true,
                                email: true,
                                website: true,
                                address: true,
                                planType: true
                            }
                        }
                    }
                },
                subscription: {
                    select: {
                        planType: true,
                        currentPeriodStart: true,
                        currentPeriodEnd: true
                    }
                }
            }
        });
        if (!invoice) {
            res.status(404).json({ message: 'Invoice not found' });
            return;
        }
        const metadata = (invoice.metadata && typeof invoice.metadata === 'object')
            ? invoice.metadata
            : {};
        const planName = ((typeof metadata.planType === 'string' ? metadata.planType : null)
            || invoice.subscription?.planType
            || invoice.billingAccount.organization.planType
            || 'BASIC');
        const periodStart = invoice.periodStart || invoice.subscription?.currentPeriodStart || invoice.createdAt;
        let periodEnd = invoice.periodEnd || invoice.subscription?.currentPeriodEnd || null;
        if (!periodEnd && typeof metadata.durationDays === 'number' && Number.isFinite(metadata.durationDays)) {
            const days = Math.max(0, Math.floor(Number(metadata.durationDays)));
            if (days > 0) {
                periodEnd = new Date(periodStart.getTime() + days * 24 * 60 * 60 * 1000);
            }
        }
        const discountCents = typeof metadata.discountCents === 'number' ? Math.max(0, Math.floor(metadata.discountCents)) : 0;
        const taxCents = typeof metadata.taxCents === 'number' ? Math.max(0, Math.floor(metadata.taxCents)) : 0;
        const notes = typeof metadata.notes === 'string' ? metadata.notes : null;
        const invoiceNumber = invoice.invoiceNumber || `INV-${invoice.id.slice(0, 8).toUpperCase()}`;
        const pdfBuffer = await (0, invoice_pdf_service_1.buildInvoicePdfBuffer)({
            invoiceNumber,
            invoiceDate: invoice.createdAt,
            status: invoice.status,
            paidAt: invoice.paidAt,
            periodStart,
            periodEnd,
            planName,
            planType: planName,
            currency: invoice.currency || 'USD',
            amountCents: invoice.amountCents,
            discountCents,
            taxCents,
            billTo: {
                name: invoice.billingAccount.organization.name,
                email: invoice.billingAccount.billingEmail || invoice.billingAccount.organization.email,
                website: invoice.billingAccount.organization.website,
                address: invoice.billingAccount.organization.address
            },
            notes
        });
        const filename = (0, invoice_filename_service_1.buildInvoiceDownloadFilename)({
            organizationName: invoice.billingAccount.organization.name,
            organizationId: invoice.billingAccount.organization.id,
            invoiceNumber: invoice.invoiceNumber,
            invoiceId: invoice.id,
            invoiceDate: invoice.createdAt
        });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', (0, invoice_filename_service_1.buildInvoiceContentDisposition)(filename));
        res.status(200).send(pdfBuffer);
    }
    catch (error) {
        console.error('[Organizations] download invoice error:', error);
        res.status(500).json({ message: error.message || 'Failed to download invoice' });
    }
};
exports.downloadMyOrganizationInvoicePdf = downloadMyOrganizationInvoicePdf;
const adminCreateOrganization = async (req, res) => {
    try {
        const payload = adminCreateOrgSchema.parse(req.body);
        // @ts-ignore
        const user = req.user;
        const auditContext = user ? { adminId: user.id, ip: req.ip, userAgent: req.headers['user-agent'], role: user.role } : undefined;
        const result = await orgService.adminCreateOrganization(payload, auditContext);
        res.status(201).json({
            organization: result.org,
            user: { id: result.user.id, email: result.user.email }
        });
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            res.status(400).json({
                message: error.issues[0]?.message || 'Invalid organization payload',
                errors: error.issues
            });
            return;
        }
        res.status(400).json({ message: error.message || 'Error creating organization' });
    }
};
exports.adminCreateOrganization = adminCreateOrganization;
const updateMyOrgSchema = zod_1.z.object({
    name: zod_1.z.string().min(1),
    email: zod_1.z.string().email(),
    website: zod_1.z.string().url().optional().or(zod_1.z.literal('')),
    phone: zod_1.z.string().min(1),
    address: zod_1.z.string().min(1),
    countryId: zod_1.z.string().uuid(),
    stateId: zod_1.z.string().optional().nullable().or(zod_1.z.literal('')),
    categoryId: zod_1.z.string().uuid(),
    type: zod_1.z.enum(['PUBLIC', 'PRIVATE', 'NON_PROFIT']),
    about: zod_1.z.string().optional(),
    logo: zod_1.z.string().optional()
});
const updateMyOrganization = async (req, res) => {
    try {
        const userId = req.user.id;
        const user = await client_1.prisma.user.findUnique({
            where: { id: userId },
            include: { organization: true }
        });
        if (!user?.organization) {
            res.status(404).json({ message: 'Organization not found' });
            return;
        }
        const currentOrg = user.organization;
        // Parse and validate using Zod
        const payload = updateMyOrgSchema.parse(req.body);
        const { website, ...otherUpdates } = payload;
        // Safety Check: Restrict Org Logo updates to internal uploads only
        if (otherUpdates.logo && otherUpdates.logo !== currentOrg.logo) {
            const backendUrl = process.env.BACKEND_URL || 'http://localhost:8000';
            const isInternal = otherUpdates.logo.startsWith(backendUrl) ||
                otherUpdates.logo.startsWith('/uploads') ||
                otherUpdates.logo.startsWith('http://localhost:8000');
            if (!isInternal) {
                res.status(403).json({ message: 'Organizations are restricted to file uploads for logos.' });
                return;
            }
        }
        // 1. Handle Website Update (Review Queue)
        if (website && website !== currentOrg.website) {
            await requestService.createRequest({
                type: 'ORG_WEBSITE_UPDATE',
                payload: { website },
                requesterId: userId,
                organizationId: currentOrg.id
            });
            // We do NOT update the website in the DB yet.
        }
        // 2. Handle Other Updates (Immediate)
        if (Object.keys(otherUpdates).length > 0) {
            // Clean up optional fields that might be empty strings if Zod allowed them (though UUID checks prevent invalid ones)
            // Zod schema ensures strict types.
            // Handle stateId explicitly if it was passed as empty string or null
            const cleanUpdates = { ...otherUpdates };
            if (cleanUpdates.stateId === '')
                cleanUpdates.stateId = null;
            await client_1.prisma.organization.update({
                where: { id: currentOrg.id },
                data: cleanUpdates
            });
            const siteUpdates = {};
            if (cleanUpdates.name)
                siteUpdates.name = cleanUpdates.name;
            if (cleanUpdates.countryId)
                siteUpdates.countryId = cleanUpdates.countryId;
            if (cleanUpdates.stateId !== undefined)
                siteUpdates.stateId = cleanUpdates.stateId;
            if (cleanUpdates.categoryId)
                siteUpdates.categoryId = cleanUpdates.categoryId;
            if (Object.keys(siteUpdates).length > 0) {
                await client_1.prisma.site.updateMany({
                    where: { organizationId: currentOrg.id },
                    data: siteUpdates
                });
            }
        }
        // Return updated (or current) org
        const updatedOrg = await client_1.prisma.organization.findUnique({
            where: { id: currentOrg.id },
            include: { country: true, state: true, category: true }
        });
        if (updatedOrg?.status === 'APPROVED') {
            const sites = await client_1.prisma.site.findMany({
                where: { organizationId: currentOrg.id, status: 'SUCCESS' },
                include: { country: true, state: true, category: true, organization: true }
            });
            const { indexSite } = await Promise.resolve().then(() => __importStar(require('../services/meilisearch.service')));
            for (const site of sites) {
                await indexSite(site);
            }
        }
        res.json({
            message: 'Organization updated',
            warning: website && website !== currentOrg.website ? 'Website update submitted for review' : undefined,
            organization: updatedOrg
        });
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            res.status(400).json({ errors: error.issues });
            return;
        }
        res.status(500).json({ message: 'Error updating organization' });
    }
};
exports.updateMyOrganization = updateMyOrganization;
const getPublicProfile = async (req, res) => {
    try {
        const { id } = req.params;
        const org = await orgService.getPublicOrganization(id);
        if (!org) {
            res.status(404).json({ message: 'Organization not found' });
            return;
        }
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.json(org);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getPublicProfile = getPublicProfile;
const getPublicSitemap = async (req, res) => {
    try {
        const entries = await orgService.getPublicOrganizationSitemapEntries();
        res.json({ entries });
    }
    catch (error) {
        res.status(500).json({ message: error.message || 'Failed to load sitemap entries' });
    }
};
exports.getPublicSitemap = getPublicSitemap;
const updateOrganization = async (req, res) => {
    try {
        const { id } = req.params;
        const payload = updateOrgSchema.parse(req.body);
        // Fetch current organization to verify changes
        const currentOrg = await orgService.getOrganizationById(id);
        if (!currentOrg) {
            res.status(404).json({ message: 'Organization not found' });
            return;
        }
        const updates = {};
        // Compare and build updates (Schema-Aware Diffing)
        if (payload.name !== undefined && payload.name !== currentOrg.name)
            updates.name = payload.name;
        if (payload.email !== undefined && payload.email !== currentOrg.email)
            updates.email = payload.email;
        if (payload.website !== undefined && payload.website !== currentOrg.website)
            updates.website = payload.website;
        if (payload.phone !== undefined && payload.phone !== currentOrg.phone)
            updates.phone = payload.phone;
        if (payload.address !== undefined && payload.address !== currentOrg.address)
            updates.address = payload.address;
        if (payload.status !== undefined && payload.status !== currentOrg.status)
            updates.status = payload.status;
        if (payload.type !== undefined && payload.type !== currentOrg.type)
            updates.type = payload.type;
        if (payload.about !== undefined && payload.about !== currentOrg.about)
            updates.about = payload.about;
        if (payload.logo !== undefined && payload.logo !== currentOrg.logo)
            updates.logo = payload.logo;
        // Handle IDs (Careful with null/undefined vs mismatch)
        if (payload.countryId !== undefined && payload.countryId !== currentOrg.countryId)
            updates.countryId = payload.countryId;
        // Handle State ID (Empty string means null)
        if (payload.stateId !== undefined) {
            const newStateId = payload.stateId === '' ? null : payload.stateId;
            if (newStateId !== currentOrg.stateId)
                updates.stateId = newStateId;
        }
        // Handle Category ID (Empty string means null)
        if (payload.categoryId !== undefined) {
            const newCategoryId = payload.categoryId === '' || payload.categoryId === null ? undefined : payload.categoryId;
            if (newCategoryId && newCategoryId !== currentOrg.categoryId)
                updates.categoryId = newCategoryId;
        }
        if (payload.priority !== undefined && payload.priority !== currentOrg.priority)
            updates.priority = payload.priority;
        if (payload.isRestricted !== undefined && payload.isRestricted !== currentOrg.isRestricted)
            updates.isRestricted = payload.isRestricted;
        // If no changes, return early
        if (Object.keys(updates).length === 0) {
            res.json(currentOrg);
            return;
        }
        // Apply partial update
        // @ts-ignore
        const user = req.user;
        const auditContext = user
            ? {
                adminId: user.id,
                ip: req.ip,
                userAgent: req.headers['user-agent'],
                role: user.role
            }
            : undefined;
        const result = await orgService.updateOrganization(id, updates, auditContext);
        res.json(result);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            res.status(400).json({ errors: error.issues });
            return;
        }
        res.status(400).json({ message: error.message || 'Error updating organization' });
    }
};
exports.updateOrganization = updateOrganization;
const deleteOrganization = async (req, res) => {
    try {
        const { id } = req.params;
        // @ts-ignore
        const user = req.user;
        const auditContext = user ? { adminId: user.id, ip: req.ip, userAgent: req.headers['user-agent'], role: user.role } : undefined;
        const { reason } = req.body || {};
        await orgService.deleteOrganization(id, auditContext, reason);
        res.json({ message: 'Organization deleted successfully' });
    }
    catch (error) {
        res.status(400).json({ message: 'Operation failed. No data was modified.' });
    }
};
exports.deleteOrganization = deleteOrganization;
const restrictOrganization = async (req, res) => {
    try {
        const { id } = req.params;
        const { isRestricted } = req.body;
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
            res.status(400).json({ message: 'Restricted status must be a boolean or boolean string' });
            return;
        }
        const result = await orgService.restrictOrganization(id, restrictedBool);
        res.json(result);
    }
    catch (error) {
        res.status(400).json({ message: error.message || 'Error updating restriction status' });
    }
};
exports.restrictOrganization = restrictOrganization;
const deleteOrganizationsBulk = async (req, res) => {
    try {
        const { ids, reason } = req.body;
        if (!Array.isArray(ids) || ids.length === 0) {
            res.status(400).json({ message: 'Invalid or empty IDs array' });
            return;
        }
        // @ts-ignore
        const user = req.user;
        const auditContext = user ? { adminId: user.id, ip: req.ip, userAgent: req.headers['user-agent'], role: user.role } : undefined;
        const result = await orgService.deleteOrganizations(ids, auditContext, reason);
        res.json({
            message: 'Bulk delete operation completed',
            ...result
        });
    }
    catch (error) {
        res.status(500).json({ message: 'Operation failed. No data was modified.' });
    }
};
exports.deleteOrganizationsBulk = deleteOrganizationsBulk;
const restoreOrganization = async (req, res) => {
    try {
        const { id } = req.params;
        // @ts-ignore
        const user = req.user;
        const auditContext = user ? { adminId: user.id, ip: req.ip, userAgent: req.headers['user-agent'], role: user.role } : undefined;
        const restored = await orgService.restoreOrganization(id, auditContext);
        res.json({ message: 'Organization restored successfully', organization: restored });
    }
    catch (error) {
        res.status(400).json({ message: error.message || 'Operation failed. No data was modified.' });
    }
};
exports.restoreOrganization = restoreOrganization;
const permanentlyDeleteOrganization = async (req, res) => {
    try {
        const { id } = req.params;
        // @ts-ignore
        const user = req.user;
        const auditContext = user ? { adminId: user.id, ip: req.ip, userAgent: req.headers['user-agent'], role: user.role } : undefined;
        const deleted = await orgService.permanentlyDeleteOrganization(id, auditContext);
        res.json({ message: 'Organization permanently deleted', organization: deleted });
    }
    catch (error) {
        res.status(400).json({ message: error.message || 'Operation failed. No data was modified.' });
    }
};
exports.permanentlyDeleteOrganization = permanentlyDeleteOrganization;
const updateOrganizationPriority = async (req, res) => {
    try {
        const { id } = req.params;
        const { priority, durationDays } = req.body;
        const normalizedPriority = typeof priority === 'string' ? priority.trim().toUpperCase() : priority;
        if (!ORG_PRIORITY_VALUES.includes(normalizedPriority)) {
            res.status(400).json({ message: 'Invalid priority value' });
            return;
        }
        const org = await orgService.updateOrganizationPriority(id, normalizedPriority, durationDays);
        res.json(org);
    }
    catch (error) {
        res.status(500).json({ message: error.message || 'Error updating priority' });
    }
};
exports.updateOrganizationPriority = updateOrganizationPriority;
const bulkUpdateOrganizationPriority = async (req, res) => {
    try {
        const { ids, priority, durationDays } = req.body;
        const normalizedPriority = typeof priority === 'string' ? priority.trim().toUpperCase() : priority;
        if (!Array.isArray(ids) || ids.length === 0) {
            res.status(400).json({ message: 'Invalid or empty IDs array' });
            return;
        }
        if (!ORG_PRIORITY_VALUES.includes(normalizedPriority)) {
            res.status(400).json({ message: 'Invalid priority value' });
            return;
        }
        const result = await orgService.bulkUpdateOrganizationPriority(ids, normalizedPriority, durationDays);
        res.json({
            message: `Priority updated for ${result.count} organizations`,
            count: result.count,
            reindex: result.reindex
        });
    }
    catch (error) {
        res.status(500).json({ message: error.message || 'Error updating priority in bulk' });
    }
};
exports.bulkUpdateOrganizationPriority = bulkUpdateOrganizationPriority;
const updateOrganizationPlan = async (req, res) => {
    try {
        const { id } = req.params;
        const payload = updatePlanSchema.parse(req.body);
        const user = req.user;
        const auditContext = user ? { adminId: user.id, ip: req.ip, userAgent: req.headers['user-agent'] } : undefined;
        const updated = await orgService.updateOrganizationPlan(id, payload, auditContext);
        res.json(updated);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            res.status(400).json({ errors: error.issues });
            return;
        }
        res.status(400).json({ message: error.message || 'Error updating organization plan' });
    }
};
exports.updateOrganizationPlan = updateOrganizationPlan;
const bulkUpdateOrganizationPlan = async (req, res) => {
    try {
        const { ids, data } = req.body;
        if (!Array.isArray(ids) || ids.length === 0) {
            res.status(400).json({ message: 'Invalid or empty IDs array' });
            return;
        }
        const payload = updatePlanSchema.parse(data);
        const user = req.user;
        const auditContext = user ? { adminId: user.id, ip: req.ip, userAgent: req.headers['user-agent'] } : undefined;
        const result = await orgService.bulkUpdateOrganizationPlan(ids, payload, auditContext);
        res.json({
            message: `Plan updated for ${result.updated.length} organizations`,
            ...result
        });
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            res.status(400).json({ errors: error.issues });
            return;
        }
        res.status(500).json({ message: error.message || 'Error updating plan in bulk' });
    }
};
exports.bulkUpdateOrganizationPlan = bulkUpdateOrganizationPlan;
