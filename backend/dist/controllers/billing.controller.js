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
exports.getTrialStatus = exports.startTrial = exports.mockCallback = exports.mockCheckout = exports.sslcommerzCancel = exports.sslcommerzFail = exports.sslcommerzSuccess = exports.stripeWebhook = exports.checkout = void 0;
const zod_1 = require("zod");
const client_1 = require("@prisma/client");
const billingService = __importStar(require("../services/billing.service"));
const client_2 = require("../db/client");
const payment_config_1 = require("../config/payment.config");
const trialService = __importStar(require("../services/trial.service"));
const billing_security_service_1 = require("../services/billing-security.service");
const enterprise_compliance_service_1 = require("../services/enterprise-compliance.service");
const BILLING_TERM_VALUES = ['MONTHLY', 'ANNUAL'];
const CHECKOUT_PLAN_VALUES = ['BASIC', 'PRO', 'BUSINESS'];
const PAYMENT_MISCONFIGURED_MESSAGE = 'Payment system misconfigured. Please contact support.';
const mockCheckoutSchema = zod_1.z.object({
    organizationId: zod_1.z.string().uuid().optional(),
    planType: zod_1.z.nativeEnum(client_1.PlanType),
    amountCents: zod_1.z.number().int().positive(),
    currency: zod_1.z.string().optional(),
    durationDays: zod_1.z.number().int().positive().optional(),
    billingTerm: zod_1.z.enum(BILLING_TERM_VALUES).optional(),
    billingEmail: zod_1.z.string().email().optional(),
    billingName: zod_1.z.string().optional(),
    simulate: zod_1.z.enum(['success', 'failure']).optional(),
});
const mockCallbackSchema = zod_1.z.object({
    paymentAttemptId: zod_1.z.string().uuid(),
    result: zod_1.z.enum(['success', 'failure']),
});
const startTrialSchema = zod_1.z.object({
    durationDays: zod_1.z
        .literal(trialService.PRO_TRIAL_DURATION_DAYS)
        .optional()
        .default(trialService.PRO_TRIAL_DURATION_DAYS),
    planType: zod_1.z.nativeEnum(client_1.PlanType).optional(),
});
const checkoutSchema = zod_1.z
    .object({
    plan: zod_1.z.enum(CHECKOUT_PLAN_VALUES),
    billingCadence: zod_1.z.enum(BILLING_TERM_VALUES),
})
    .strict();
const resolveOrganizationId = async (actor) => {
    if (!actor)
        return null;
    if (actor.organizationId)
        return actor.organizationId;
    if (!actor.id)
        return null;
    const user = await client_2.prisma.user.findUnique({
        where: { id: actor.id },
        select: { organizationId: true },
    });
    return user?.organizationId ?? null;
};
const assertBillingComplianceForOrganization = async (organizationId, actorRole) => {
    const organization = await client_2.prisma.organization.findUnique({
        where: { id: organizationId },
        select: { id: true, planType: true, deletedAt: true },
    });
    if (!organization || organization.deletedAt) {
        throw new Error('Organization not found');
    }
    if (organization.planType !== client_1.PlanType.ENTERPRISE) {
        return;
    }
    await (0, enterprise_compliance_service_1.assertEnterpriseCompliance)({
        enterpriseId: organization.id,
        action: 'BILLING_CHANGE',
        actorRole,
    });
};
const resolveAppUrl = () => {
    const appUrl = (process.env.APP_URL || '').trim();
    if (!appUrl) {
        throw new payment_config_1.PaymentConfigurationError('APP_URL must be set.');
    }
    return appUrl.replace(/\/+$/g, '');
};
const resolveSSLCommerzFailureRedirect = () => {
    return `${resolveAppUrl()}/org/upgrade?status=failed`;
};
const handlePaymentConfigurationError = (error, res) => {
    if (!(error instanceof payment_config_1.PaymentConfigurationError)) {
        return false;
    }
    // Keep full diagnostics in logs while masking config internals from clients.
    console.error('[Billing] Payment configuration error:', error);
    const message = process.env.NODE_ENV === 'production'
        ? PAYMENT_MISCONFIGURED_MESSAGE
        : error.message;
    res.status(500).json({ message });
    return true;
};
const checkout = async (req, res) => {
    try {
        const payload = checkoutSchema.parse(req.body);
        const actor = req.user;
        if (actor?.role) {
            res
                .status(403)
                .json({ message: 'Checkout is limited to organization accounts' });
            return;
        }
        const resolvedOrgId = await resolveOrganizationId(actor);
        if (!resolvedOrgId) {
            res.status(403).json({ message: 'Organization user required' });
            return;
        }
        await assertBillingComplianceForOrganization(resolvedOrgId, 'OWNER');
        const idempotencyKey = req.headers['idempotency-key'];
        const result = await billingService.createCheckout({
            organizationId: resolvedOrgId,
            planType: payload.plan,
            billingTerm: payload.billingCadence,
            idempotencyKey,
        });
        res.json({ redirectUrl: result.redirectUrl });
    }
    catch (error) {
        if ((0, enterprise_compliance_service_1.isEnterpriseComplianceError)(error)) {
            res.status(error.status).json((0, enterprise_compliance_service_1.toEnterpriseComplianceErrorResponse)(error));
            return;
        }
        if (handlePaymentConfigurationError(error, res)) {
            return;
        }
        if (error instanceof zod_1.z.ZodError) {
            res.status(400).json({ errors: error.issues });
            return;
        }
        res.status(400).json({ message: error.message || 'Checkout failed' });
    }
};
exports.checkout = checkout;
const stripeWebhook = async (req, res) => {
    try {
        const signature = req.headers['stripe-signature'];
        const rawBody = req.rawBody ?? req.rawBodyText ?? null;
        if (!rawBody) {
            res.status(400).json({ message: 'Missing raw webhook body' });
            return;
        }
        const result = await billingService.handleStripeWebhook({
            rawBody,
            signature,
        });
        res.json(result);
    }
    catch (error) {
        if (handlePaymentConfigurationError(error, res)) {
            return;
        }
        res
            .status(400)
            .json({ message: error.message || 'Stripe webhook rejected' });
    }
};
exports.stripeWebhook = stripeWebhook;
const handleSSLCommerzCallback = async (req, res, kind) => {
    try {
        const payload = {
            ...req.query,
            ...(req.body || {}),
        };
        const result = await billingService.processSSLCommerzCallback({
            kind,
            payload,
        });
        res.redirect(302, result.redirectUrl);
    }
    catch (error) {
        if (error instanceof payment_config_1.PaymentConfigurationError) {
            console.error('[Billing] Payment configuration error during SSLCommerz callback:', error);
        }
        else {
            console.error('[Billing] SSLCommerz callback failed:', error);
        }
        let fallbackRedirect = '/org/upgrade?status=failed';
        try {
            fallbackRedirect = resolveSSLCommerzFailureRedirect();
        }
        catch (redirectError) {
            console.error('[Billing] Failed to resolve SSLCommerz failure redirect:', redirectError);
        }
        res.redirect(302, fallbackRedirect);
    }
};
const sslcommerzSuccess = async (req, res) => {
    await handleSSLCommerzCallback(req, res, 'success');
};
exports.sslcommerzSuccess = sslcommerzSuccess;
const sslcommerzFail = async (req, res) => {
    await handleSSLCommerzCallback(req, res, 'fail');
};
exports.sslcommerzFail = sslcommerzFail;
const sslcommerzCancel = async (req, res) => {
    await handleSSLCommerzCallback(req, res, 'cancel');
};
exports.sslcommerzCancel = sslcommerzCancel;
const mockCheckout = async (req, res) => {
    try {
        const payload = mockCheckoutSchema.parse(req.body);
        const actor = req.user;
        let organizationId = payload.organizationId;
        if (actor?.role) {
            if (!organizationId) {
                res
                    .status(400)
                    .json({ message: 'organizationId is required for admin checkout' });
                return;
            }
        }
        else {
            const resolvedOrgId = await resolveOrganizationId(actor);
            if (!resolvedOrgId) {
                res.status(403).json({ message: 'Organization user required' });
                return;
            }
            if (organizationId && organizationId !== resolvedOrgId) {
                res.status(403).json({ message: 'Forbidden' });
                return;
            }
            organizationId = resolvedOrgId;
        }
        const idempotencyKey = req.headers['idempotency-key'];
        if (!organizationId) {
            res.status(400).json({ message: 'organizationId is required' });
            return;
        }
        await assertBillingComplianceForOrganization(organizationId, actor?.role ? String(actor.role).toUpperCase() : 'OWNER');
        const result = await billingService.createMockCheckout({
            ...payload,
            organizationId,
            idempotencyKey,
        });
        res.json(result);
    }
    catch (error) {
        if ((0, enterprise_compliance_service_1.isEnterpriseComplianceError)(error)) {
            res.status(error.status).json((0, enterprise_compliance_service_1.toEnterpriseComplianceErrorResponse)(error));
            return;
        }
        if (error instanceof zod_1.z.ZodError) {
            res.status(400).json({ errors: error.issues });
            return;
        }
        res.status(400).json({ message: error.message || 'Mock checkout failed' });
    }
};
exports.mockCheckout = mockCheckout;
const mockCallback = async (req, res) => {
    try {
        const signature = req.headers['x-webhook-signature'];
        const signatureCheck = (0, billing_security_service_1.verifyWebhookSignature)(req.body || {}, signature);
        if (!signatureCheck.verified) {
            res
                .status(400)
                .json({ message: signatureCheck.reason || 'Invalid signature' });
            return;
        }
        const payload = mockCallbackSchema.parse(req.body);
        const actor = req.user;
        const attemptForCompliance = await client_2.prisma.paymentAttempt.findUnique({
            where: { id: payload.paymentAttemptId },
            include: {
                billingAccount: {
                    select: {
                        organizationId: true,
                    },
                },
            },
        });
        if (!actor?.role) {
            const resolvedOrgId = await resolveOrganizationId(actor);
            if (!resolvedOrgId) {
                res.status(403).json({ message: 'Organization user required' });
                return;
            }
            if (!attemptForCompliance ||
                attemptForCompliance.billingAccount.organizationId !== resolvedOrgId) {
                res.status(403).json({ message: 'Forbidden' });
                return;
            }
        }
        if (attemptForCompliance?.billingAccount.organizationId) {
            await assertBillingComplianceForOrganization(attemptForCompliance.billingAccount.organizationId, actor?.role ? String(actor.role).toUpperCase() : 'OWNER');
        }
        const result = await billingService.processMockCallback(payload);
        res.json(result);
    }
    catch (error) {
        if ((0, enterprise_compliance_service_1.isEnterpriseComplianceError)(error)) {
            res.status(error.status).json((0, enterprise_compliance_service_1.toEnterpriseComplianceErrorResponse)(error));
            return;
        }
        if (error instanceof zod_1.z.ZodError) {
            res.status(400).json({ errors: error.issues });
            return;
        }
        res.status(400).json({ message: error.message || 'Mock callback failed' });
    }
};
exports.mockCallback = mockCallback;
const startTrial = async (req, res) => {
    try {
        const payload = startTrialSchema.parse(req.body);
        const actor = req.user;
        if (actor?.role) {
            res
                .status(403)
                .json({ message: 'Trial start is limited to organization accounts' });
            return;
        }
        const resolvedOrgId = await resolveOrganizationId(actor);
        if (!resolvedOrgId) {
            res.status(403).json({ message: 'Organization user required' });
            return;
        }
        await assertBillingComplianceForOrganization(resolvedOrgId, 'OWNER');
        const trial = await trialService.startTrial({
            organizationId: resolvedOrgId,
            durationDays: payload.durationDays,
            planType: payload.planType,
        });
        res.json({ trial });
    }
    catch (error) {
        if ((0, enterprise_compliance_service_1.isEnterpriseComplianceError)(error)) {
            res.status(error.status).json((0, enterprise_compliance_service_1.toEnterpriseComplianceErrorResponse)(error));
            return;
        }
        if (error instanceof trialService.TrialServiceError &&
            error.code === 'TRIAL_ALREADY_USED') {
            res.status(400).json({ error: 'TRIAL_ALREADY_USED' });
            return;
        }
        if (error instanceof zod_1.z.ZodError) {
            res.status(400).json({ errors: error.issues });
            return;
        }
        res.status(400).json({ message: error.message || 'Failed to start trial' });
    }
};
exports.startTrial = startTrial;
const getTrialStatus = async (req, res) => {
    try {
        const actor = req.user;
        if (actor?.role) {
            res
                .status(403)
                .json({ message: 'Trial status is limited to organization accounts' });
            return;
        }
        const resolvedOrgId = await resolveOrganizationId(actor);
        if (!resolvedOrgId) {
            res.status(403).json({ message: 'Organization user required' });
            return;
        }
        const status = await trialService.getTrialStatus(resolvedOrgId);
        res.json(status);
    }
    catch (error) {
        res
            .status(500)
            .json({ message: error.message || 'Failed to load trial status' });
    }
};
exports.getTrialStatus = getTrialStatus;
