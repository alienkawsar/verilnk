import { Request, Response } from 'express';
import * as orgService from '../services/organization.service';
import * as requestService from '../services/request.service';
import { prisma } from '../db/client';
import { z } from 'zod';
import { RequestType, PlanType, PlanStatus } from '@prisma/client';
import { verifyCaptcha } from '../services/recaptcha.service';
import { resolveOrganizationEntitlements } from '../services/entitlement.service';
import { STRONG_PASSWORD_MESSAGE, STRONG_PASSWORD_REGEX } from '../utils/passwordPolicy';
import { buildInvoicePdfBuffer } from '../services/invoice-pdf.service';
import { buildInvoiceContentDisposition, buildInvoiceDownloadFilename } from '../services/invoice-filename.service';

const orgSignupSchema = z.object({
    email: z.string().email(),
    password: z.string().regex(STRONG_PASSWORD_REGEX, STRONG_PASSWORD_MESSAGE),
    orgName: z.string().min(1),
    website: z.string().url(),
    phone: z.string().min(1),
    address: z.string().min(1),
    countryId: z.string().uuid(),
    stateId: z.string().optional(),
    categoryId: z.string().uuid(),
    type: z.enum(['PUBLIC', 'PRIVATE', 'NON_PROFIT']),
    about: z.string().optional(),
    logo: z.string().optional(),
    captchaToken: z.string().optional(),
    captchaAction: z.string().optional()
});

// ... existing code

export const signupOrganization = async (req: Request, res: Response): Promise<void> => {
    try {
        const data = orgSignupSchema.parse(req.body);

        // Verify Captcha
        if (data.captchaToken) {
            const isHuman = await verifyCaptcha(data.captchaToken, 'org_signup');
            if (!isHuman) {
                res.status(400).json({ message: 'Invalid CAPTCHA' });
                return;
            }
        } else if (process.env.NODE_ENV === 'production') {
            res.status(400).json({ message: 'CAPTCHA required' });
            return;
        }

        // Remove captchaToken from data passed to service if service is strict, or just pass it (service acts on known fields)
        // Ideally remove it.
        const { captchaToken, captchaAction, ...serviceData } = data;

        const result = await orgService.signupOrganization(serviceData as any);
        res.status(201).json(result);
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ errors: error.issues });
            return;
        }
        res.status(400).json({ message: error.message || 'Error signing up organization' });
    }
};

const updateOrgSchema = z.object({
    name: z.string().optional(),
    email: z.string().email().optional(),
    website: z.string().url().optional(),
    phone: z.string().optional(),
    address: z.string().optional(),
    status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
    type: z.enum(['PUBLIC', 'PRIVATE', 'NON_PROFIT']).optional(),
    about: z.string().optional(),
    logo: z.string().optional(),
    countryId: z.string().uuid().optional(),
    stateId: z.union([z.string().uuid(), z.string().length(0), z.null()]).optional(),
    categoryId: z.union([z.string().uuid(), z.string().length(0), z.null()]).optional(),
    priority: z.preprocess((value) => (typeof value === 'string' ? value.trim().toUpperCase() : value), z.enum(['HIGH', 'MEDIUM', 'NORMAL', 'LOW'])).optional(),
    isRestricted: z.boolean().optional()
});

const updatePlanSchema = z.object({
    planType: z.nativeEnum(PlanType),
    planStatus: z.nativeEnum(PlanStatus),
    durationDays: z.number().int().nonnegative().optional(),
    priorityOverride: z.number().int().optional().nullable(),
    enterpriseMaxWorkspaces: z.number().int().min(1).max(1_000_000).optional().nullable(),
    enterpriseMaxLinkedOrgs: z.number().int().min(1).max(1_000_000).optional().nullable(),
    enterpriseMaxApiKeys: z.number().int().min(1).max(1_000_000).optional().nullable(),
    enterpriseMaxMembers: z.number().int().min(1).max(1_000_000).optional().nullable()
});

const BILLING_TERM_VALUES = ['MONTHLY', 'ANNUAL'] as const;
const ORG_PRIORITY_VALUES = ['HIGH', 'MEDIUM', 'NORMAL', 'LOW'] as const;

const adminCreateOrgSchema = z.object({
    name: z.string().min(1),
    email: z.string().email(),
    password: z.string().regex(STRONG_PASSWORD_REGEX, STRONG_PASSWORD_MESSAGE),
    website: z.string().url(),
    phone: z.string().min(1),
    address: z.string().min(1),
    countryId: z.string().uuid(),
    categoryId: z.string().uuid(),
    stateId: z.string().uuid().optional(),
    type: z.enum(['PUBLIC', 'PRIVATE', 'NON_PROFIT']).optional(),
    about: z.string().optional(),
    logo: z.string().optional(),
    planType: z.nativeEnum(PlanType).optional(),
    planStatus: z.nativeEnum(PlanStatus).optional(),
    durationDays: z.number().int().nonnegative().optional(),
    billingTerm: z.enum(BILLING_TERM_VALUES).optional(),
    amountCents: z.number().int().positive().optional(),
    // Discovery note (backend/src/controllers/organization.controller.ts):
    // Create payload priority was previously omitted from this schema and dropped before service write.
    priority: z.preprocess((value) => (typeof value === 'string' ? value.trim().toUpperCase() : value), z.enum(ORG_PRIORITY_VALUES)).optional(),
    priorityOverride: z.number().int().optional().nullable(),
    enterpriseMaxWorkspaces: z.number().int().min(1).max(1_000_000).optional().nullable(),
    enterpriseMaxLinkedOrgs: z.number().int().min(1).max(1_000_000).optional().nullable(),
    enterpriseMaxApiKeys: z.number().int().min(1).max(1_000_000).optional().nullable(),
    enterpriseMaxMembers: z.number().int().min(1).max(1_000_000).optional().nullable()
});

const getOrganizationsQuerySchema = z.object({
    countryId: z.string().uuid().optional(),
    stateId: z.string().uuid().optional(),
    categoryId: z.string().uuid().optional(),
    status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
    type: z.enum(['PUBLIC', 'PRIVATE', 'NON_PROFIT']).optional(),
    priority: z.enum(['HIGH', 'MEDIUM', 'NORMAL', 'LOW']).optional(),
    planType: z.nativeEnum(PlanType).optional(),
    deleted: z.enum(['only', 'include', 'exclude']).optional()
});

const normalizeQueryValue = (value: unknown): string | undefined => {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
};

export const getOrganizations = async (req: Request, res: Response): Promise<void> => {
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
    } catch (error: any) {
        console.error('[Organizations] getOrganizations error:', {
            message: error?.message,
            code: error?.code,
            stack: error?.stack
        });
        res.status(500).json({ message: 'Error fetching organizations' });
    }
};

export const getMyOrganization = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req as any).user.id;
        const user = await prisma.user.findUnique({
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
        if ((user.organization as any).deletedAt) {
            res.status(404).json({ message: 'Organization not found' });
            return;
        }

        const { entitlements, organization, wasUpdated } = await resolveOrganizationEntitlements(user.organization as any);
        const orgResponse = wasUpdated ? { ...user.organization, ...organization } : user.organization;
        const linkedEnterpriseWorkspace = await prisma.workspaceOrganization.findFirst({
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
    } catch (error: any) {
        res.status(500).json({ message: 'Error fetching organization' });
    }
};

export const downloadMyOrganizationInvoicePdf = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req as any).user?.id as string | undefined;
        if (!userId) {
            res.status(401).json({ message: 'Unauthorized' });
            return;
        }

        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { organizationId: true }
        });

        if (!user?.organizationId) {
            res.status(403).json({ message: 'Organization user required' });
            return;
        }

        const invoiceId = req.params.invoiceId as string;
        const invoice = await prisma.invoice.findFirst({
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
            ? invoice.metadata as Record<string, unknown>
            : {};

        const planName = (
            (typeof metadata.planType === 'string' ? metadata.planType : null)
            || invoice.subscription?.planType
            || invoice.billingAccount.organization.planType
            || 'BASIC'
        );

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
        const pdfBuffer = await buildInvoicePdfBuffer({
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

        const filename = buildInvoiceDownloadFilename({
            organizationName: invoice.billingAccount.organization.name,
            organizationId: invoice.billingAccount.organization.id,
            invoiceNumber: invoice.invoiceNumber,
            invoiceId: invoice.id,
            invoiceDate: invoice.createdAt
        });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader(
            'Content-Disposition',
            buildInvoiceContentDisposition(filename)
        );
        res.status(200).send(pdfBuffer);
    } catch (error: any) {
        console.error('[Organizations] download invoice error:', error);
        res.status(500).json({ message: error.message || 'Failed to download invoice' });
    }
};

export const adminCreateOrganization = async (req: Request, res: Response): Promise<void> => {
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
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            res.status(400).json({
                message: error.issues[0]?.message || 'Invalid organization payload',
                errors: error.issues
            });
            return;
        }
        res.status(400).json({ message: error.message || 'Error creating organization' });
    }
};

const updateMyOrgSchema = z.object({
    name: z.string().min(1),
    email: z.string().email(),
    website: z.string().url().optional().or(z.literal('')),
    phone: z.string().min(1),
    address: z.string().min(1),
    countryId: z.string().uuid(),
    stateId: z.string().optional().nullable().or(z.literal('')),
    categoryId: z.string().uuid(),
    type: z.enum(['PUBLIC', 'PRIVATE', 'NON_PROFIT']),
    about: z.string().optional(),
    logo: z.string().optional()
});

export const updateMyOrganization = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req as any).user.id;
        const user = await prisma.user.findUnique({
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
                type: 'ORG_WEBSITE_UPDATE' as any,
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
            const cleanUpdates: any = { ...otherUpdates };
            if (cleanUpdates.stateId === '') cleanUpdates.stateId = null;

            await prisma.organization.update({
                where: { id: currentOrg.id },
                data: cleanUpdates
            });

            const siteUpdates: any = {};
            if (cleanUpdates.name) siteUpdates.name = cleanUpdates.name;
            if (cleanUpdates.countryId) siteUpdates.countryId = cleanUpdates.countryId;
            if (cleanUpdates.stateId !== undefined) siteUpdates.stateId = cleanUpdates.stateId;
            if (cleanUpdates.categoryId) siteUpdates.categoryId = cleanUpdates.categoryId;

            if (Object.keys(siteUpdates).length > 0) {
                await prisma.site.updateMany({
                    where: { organizationId: currentOrg.id },
                    data: siteUpdates
                });
            }
        }

        // Return updated (or current) org
        const updatedOrg = await prisma.organization.findUnique({
            where: { id: currentOrg.id },
            include: { country: true, state: true, category: true }
        });

        if (updatedOrg?.status === 'APPROVED') {
            const sites = await prisma.site.findMany({
                where: { organizationId: currentOrg.id, status: 'SUCCESS' as any },
                include: { country: true, state: true, category: true, organization: true }
            });
            const { indexSite } = await import('../services/meilisearch.service');
            for (const site of sites) {
                await indexSite(site as any);
            }
        }
        res.json({
            message: 'Organization updated',
            warning: website && website !== currentOrg.website ? 'Website update submitted for review' : undefined,
            organization: updatedOrg
        });

    } catch (error: any) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ errors: error.issues });
            return;
        }
        res.status(500).json({ message: 'Error updating organization' });
    }
};



export const getPublicProfile = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const org = await orgService.getPublicOrganization(id as string);
        if (!org) {
            res.status(404).json({ message: 'Organization not found' });
            return;
        }
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.json(org);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const getPublicSitemap = async (req: Request, res: Response): Promise<void> => {
    try {
        const entries = await orgService.getPublicOrganizationSitemapEntries();
        res.json({ entries });
    } catch (error: any) {
        res.status(500).json({ message: error.message || 'Failed to load sitemap entries' });
    }
};

export const updateOrganization = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const payload = updateOrgSchema.parse(req.body);

        // Fetch current organization to verify changes
        const currentOrg = await orgService.getOrganizationById(id as string);
        if (!currentOrg) {
            res.status(404).json({ message: 'Organization not found' });
            return;
        }

        const updates: any = {};

        // Compare and build updates (Schema-Aware Diffing)
        if (payload.name !== undefined && payload.name !== currentOrg.name) updates.name = payload.name;
        if (payload.email !== undefined && payload.email !== currentOrg.email) updates.email = payload.email;
        if (payload.website !== undefined && payload.website !== currentOrg.website) updates.website = payload.website;
        if (payload.phone !== undefined && payload.phone !== currentOrg.phone) updates.phone = payload.phone;
        if (payload.address !== undefined && payload.address !== currentOrg.address) updates.address = payload.address;

        if (payload.status !== undefined && payload.status !== currentOrg.status) updates.status = payload.status;
        if (payload.type !== undefined && payload.type !== currentOrg.type) updates.type = payload.type;
        if (payload.about !== undefined && payload.about !== currentOrg.about) updates.about = payload.about;
        if (payload.logo !== undefined && payload.logo !== currentOrg.logo) updates.logo = payload.logo;

        // Handle IDs (Careful with null/undefined vs mismatch)
        if (payload.countryId !== undefined && payload.countryId !== currentOrg.countryId) updates.countryId = payload.countryId;

        // Handle State ID (Empty string means null)
        if (payload.stateId !== undefined) {
            const newStateId = payload.stateId === '' ? null : payload.stateId;
            if (newStateId !== currentOrg.stateId) updates.stateId = newStateId;
        }

        // Handle Category ID (Empty string means null)
        if (payload.categoryId !== undefined) {
            const newCategoryId = payload.categoryId === '' || payload.categoryId === null ? undefined : payload.categoryId;
            if (newCategoryId && newCategoryId !== currentOrg.categoryId) updates.categoryId = newCategoryId;
        }

        if (payload.priority !== undefined && payload.priority !== currentOrg.priority) updates.priority = payload.priority;
        if (payload.isRestricted !== undefined && payload.isRestricted !== currentOrg.isRestricted) updates.isRestricted = payload.isRestricted;

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
        const result = await orgService.updateOrganization(id as string, updates, auditContext);
        res.json(result);
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ errors: error.issues });
            return;
        }
        res.status(400).json({ message: error.message || 'Error updating organization' });
    }
};

export const deleteOrganization = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        // @ts-ignore
        const user = req.user;
        const auditContext = user ? { adminId: user.id, ip: req.ip, userAgent: req.headers['user-agent'], role: user.role } : undefined;
        const { reason } = req.body || {};
        await orgService.deleteOrganization(id as string, auditContext, reason);
        res.json({ message: 'Organization deleted successfully' });
    } catch (error: any) {
        res.status(400).json({ message: 'Operation failed. No data was modified.' });
    }
};

export const restrictOrganization = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const { isRestricted } = req.body;

        let restrictedBool: boolean;

        if (typeof isRestricted === 'boolean') {
            restrictedBool = isRestricted;
        } else if (isRestricted === 'true') {
            restrictedBool = true;
        } else if (isRestricted === 'false') {
            restrictedBool = false;
        } else {
            res.status(400).json({ message: 'Restricted status must be a boolean or boolean string' });
            return;
        }

        const result = await orgService.restrictOrganization(id as string, restrictedBool);
        res.json(result);
    } catch (error: any) {
        res.status(400).json({ message: error.message || 'Error updating restriction status' });
    }
};

export const deleteOrganizationsBulk = async (req: Request, res: Response): Promise<void> => {
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
    } catch (error: any) {
        res.status(500).json({ message: 'Operation failed. No data was modified.' });
    }
};

export const restoreOrganization = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        // @ts-ignore
        const user = req.user;
        const auditContext = user ? { adminId: user.id, ip: req.ip, userAgent: req.headers['user-agent'], role: user.role } : undefined;
        const restored = await orgService.restoreOrganization(id as string, auditContext);
        res.json({ message: 'Organization restored successfully', organization: restored });
    } catch (error: any) {
        res.status(400).json({ message: error.message || 'Operation failed. No data was modified.' });
    }
};

export const permanentlyDeleteOrganization = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        // @ts-ignore
        const user = req.user;
        const auditContext = user ? { adminId: user.id, ip: req.ip, userAgent: req.headers['user-agent'], role: user.role } : undefined;
        const deleted = await orgService.permanentlyDeleteOrganization(id as string, auditContext);
        res.json({ message: 'Organization permanently deleted', organization: deleted });
    } catch (error: any) {
        res.status(400).json({ message: error.message || 'Operation failed. No data was modified.' });
    }
};

export const updateOrganizationPriority = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const { priority, durationDays } = req.body;
        const normalizedPriority = typeof priority === 'string' ? priority.trim().toUpperCase() : priority;

        if (!ORG_PRIORITY_VALUES.includes(normalizedPriority as any)) {
            res.status(400).json({ message: 'Invalid priority value' });
            return;
        }

        const org = await orgService.updateOrganizationPriority(id as string, normalizedPriority as string, durationDays);
        res.json(org);
    } catch (error: any) {
        res.status(500).json({ message: error.message || 'Error updating priority' });
    }
};

export const bulkUpdateOrganizationPriority = async (req: Request, res: Response): Promise<void> => {
    try {
        const { ids, priority, durationDays } = req.body;
        const normalizedPriority = typeof priority === 'string' ? priority.trim().toUpperCase() : priority;

        if (!Array.isArray(ids) || ids.length === 0) {
            res.status(400).json({ message: 'Invalid or empty IDs array' });
            return;
        }

        if (!ORG_PRIORITY_VALUES.includes(normalizedPriority as any)) {
            res.status(400).json({ message: 'Invalid priority value' });
            return;
        }

        const result = await orgService.bulkUpdateOrganizationPriority(ids, normalizedPriority as string, durationDays);
        res.json({
            message: `Priority updated for ${result.count} organizations`,
            count: result.count,
            reindex: result.reindex
        });
    } catch (error: any) {
        res.status(500).json({ message: error.message || 'Error updating priority in bulk' });
    }
};

export const updateOrganizationPlan = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const payload = updatePlanSchema.parse(req.body);

        const user = (req as any).user;
        const auditContext = user ? { adminId: user.id, ip: req.ip, userAgent: req.headers['user-agent'] } : undefined;

        const updated = await orgService.updateOrganizationPlan(id as string, payload, auditContext);
        res.json(updated);
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ errors: error.issues });
            return;
        }
        res.status(400).json({ message: error.message || 'Error updating organization plan' });
    }
};

export const bulkUpdateOrganizationPlan = async (req: Request, res: Response): Promise<void> => {
    try {
        const { ids, data } = req.body;
        if (!Array.isArray(ids) || ids.length === 0) {
            res.status(400).json({ message: 'Invalid or empty IDs array' });
            return;
        }

        const payload = updatePlanSchema.parse(data);
        const user = (req as any).user;
        const auditContext = user ? { adminId: user.id, ip: req.ip, userAgent: req.headers['user-agent'] } : undefined;

        const result = await orgService.bulkUpdateOrganizationPlan(ids, payload, auditContext);
        res.json({
            message: `Plan updated for ${result.updated.length} organizations`,
            ...result
        });
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ errors: error.issues });
            return;
        }
        res.status(500).json({ message: error.message || 'Error updating plan in bulk' });
    }
};
