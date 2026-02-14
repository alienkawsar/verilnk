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
exports.processMockCallback = exports.createMockCheckout = void 0;
const client_1 = require("../db/client");
const client_2 = require("@prisma/client");
const crypto_1 = __importDefault(require("crypto"));
const organizationService = __importStar(require("./organization.service"));
const billing_security_service_1 = require("./billing-security.service");
const PAYMENT_MODE = (process.env.PAYMENT_MODE || 'mock').toLowerCase();
const buildMockId = (prefix) => `${prefix}_${crypto_1.default.randomBytes(8).toString('hex')}`;
const stableStringify = (payload) => {
    const sorted = Object.keys(payload)
        .sort()
        .reduce((acc, key) => {
        acc[key] = payload[key];
        return acc;
    }, {});
    return JSON.stringify(sorted);
};
const computeHash = (payload) => {
    return crypto_1.default.createHash('sha256').update(stableStringify(payload)).digest('hex');
};
const buildInvoiceNumber = () => {
    const now = new Date();
    const stamp = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(now.getUTCDate()).padStart(2, '0')}`;
    return `INV-${stamp}-${crypto_1.default.randomBytes(3).toString('hex').toUpperCase()}`;
};
const ensureBillingAccount = async (organizationId, details) => {
    const existing = await client_1.prisma.billingAccount.findUnique({ where: { organizationId } });
    if (existing) {
        if ((details?.billingEmail && existing.billingEmail !== details.billingEmail) ||
            (details?.billingName && existing.billingName !== details.billingName)) {
            return client_1.prisma.billingAccount.update({
                where: { id: existing.id },
                data: {
                    billingEmail: details?.billingEmail ?? existing.billingEmail,
                    billingName: details?.billingName ?? existing.billingName
                }
            });
        }
        return existing;
    }
    return client_1.prisma.billingAccount.create({
        data: {
            organizationId,
            gateway: client_2.BillingGateway.NONE,
            billingEmail: details?.billingEmail,
            billingName: details?.billingName
        }
    });
};
const createMockCheckout = async (params) => {
    if (PAYMENT_MODE !== 'mock') {
        throw new Error('Mock checkout is disabled');
    }
    if (params.planType === client_2.PlanType.FREE) {
        throw new Error('FREE plan does not require checkout');
    }
    if (!params.amountCents || params.amountCents <= 0) {
        throw new Error('Amount must be greater than zero');
    }
    const org = await client_1.prisma.organization.findUnique({ where: { id: params.organizationId } });
    if (!org) {
        throw new Error('Organization not found');
    }
    const billingAccount = await ensureBillingAccount(params.organizationId, {
        billingEmail: params.billingEmail ?? org.email,
        billingName: params.billingName ?? org.name
    });
    const payloadHash = computeHash({
        organizationId: params.organizationId,
        planType: params.planType,
        amountCents: params.amountCents,
        currency: params.currency || 'USD',
        durationDays: params.durationDays || null
    });
    if (params.idempotencyKey) {
        const existingAttempt = await client_1.prisma.paymentAttempt.findFirst({
            where: {
                billingAccountId: billingAccount.id,
                idempotencyKey: params.idempotencyKey
            },
            include: { invoice: true }
        });
        if (existingAttempt) {
            if (existingAttempt.requestHash && existingAttempt.requestHash !== payloadHash) {
                throw new Error('Idempotency key reuse with different payload');
            }
            return {
                paymentAttempt: existingAttempt,
                invoice: existingAttempt.invoice,
                callbackUrl: '/api/billing/mock/callback'
            };
        }
    }
    const invoiceMetadata = {
        planType: params.planType,
        durationDays: params.durationDays || null,
        organizationId: params.organizationId
    };
    const invoiceIntegrityHash = (0, billing_security_service_1.computeInvoiceIntegrity)({
        planType: params.planType,
        amountCents: params.amountCents,
        currency: params.currency || 'USD',
        organizationId: params.organizationId
    });
    const invoice = await client_1.prisma.invoice.create({
        data: {
            billingAccountId: billingAccount.id,
            status: client_2.InvoiceStatus.OPEN,
            amountCents: params.amountCents,
            currency: params.currency || 'USD',
            invoiceNumber: buildInvoiceNumber(),
            metadata: invoiceMetadata,
            integrityHash: invoiceIntegrityHash
        }
    });
    const paymentAttempt = await client_1.prisma.paymentAttempt.create({
        data: {
            billingAccountId: billingAccount.id,
            invoiceId: invoice.id,
            status: client_2.PaymentAttemptStatus.PENDING,
            amountCents: params.amountCents,
            currency: params.currency || 'USD',
            gateway: client_2.BillingGateway.MOCK,
            gatewayPaymentId: buildMockId('mock_pay'),
            idempotencyKey: params.idempotencyKey,
            requestHash: payloadHash
        }
    });
    if (params.simulate) {
        return (0, exports.processMockCallback)({
            paymentAttemptId: paymentAttempt.id,
            result: params.simulate
        });
    }
    return {
        paymentAttempt,
        invoice,
        callbackUrl: '/api/billing/mock/callback'
    };
};
exports.createMockCheckout = createMockCheckout;
const processMockCallback = async (params) => {
    if (PAYMENT_MODE !== 'mock') {
        throw new Error('Mock callback is disabled');
    }
    const attempt = await client_1.prisma.paymentAttempt.findUnique({
        where: { id: params.paymentAttemptId },
        include: {
            invoice: true,
            billingAccount: true
        }
    });
    if (!attempt) {
        throw new Error('Payment attempt not found');
    }
    if (attempt.status !== client_2.PaymentAttemptStatus.PENDING) {
        return {
            paymentAttempt: attempt,
            invoice: attempt.invoice,
            idempotent: true,
            replayed: true
        };
    }
    if (!attempt.invoice) {
        throw new Error('Invoice not found');
    }
    if (attempt.amountCents !== attempt.invoice.amountCents || attempt.currency !== attempt.invoice.currency) {
        throw new Error('Amount validation failed');
    }
    const integrityCheck = (0, billing_security_service_1.validateInvoiceIntegrity)({
        organizationId: attempt.invoice.metadata?.organizationId,
        planType: attempt.invoice.metadata?.planType,
        amountCents: attempt.invoice.amountCents,
        currency: attempt.invoice.currency,
        integrityHash: attempt.invoice.integrityHash
    });
    if (!integrityCheck.valid) {
        await client_1.prisma.$transaction([
            client_1.prisma.paymentAttempt.update({
                where: { id: attempt.id },
                data: {
                    status: client_2.PaymentAttemptStatus.FAILED,
                    processedAt: new Date(),
                    errorMessage: 'Invoice integrity validation failed'
                }
            }),
            client_1.prisma.invoice.update({
                where: { id: attempt.invoice.id },
                data: {
                    status: client_2.InvoiceStatus.VOID
                }
            })
        ]);
        throw new Error('Invoice integrity validation failed');
    }
    const now = new Date();
    if (params.result === 'failure') {
        const [paymentAttempt, invoice] = await client_1.prisma.$transaction([
            client_1.prisma.paymentAttempt.update({
                where: { id: attempt.id },
                data: {
                    status: client_2.PaymentAttemptStatus.FAILED,
                    processedAt: now,
                    errorMessage: 'Mock payment failed'
                }
            }),
            client_1.prisma.invoice.update({
                where: { id: attempt.invoice.id },
                data: {
                    status: client_2.InvoiceStatus.VOID
                }
            })
        ]);
        return { paymentAttempt, invoice };
    }
    const metadata = (attempt.invoice.metadata || {});
    const planType = metadata.planType;
    if (!planType) {
        throw new Error('Plan type missing from invoice metadata');
    }
    const durationDays = metadata.durationDays ?? 30;
    const subscriptionPeriodEnd = new Date(now);
    subscriptionPeriodEnd.setDate(subscriptionPeriodEnd.getDate() + durationDays);
    const activeSubscription = await client_1.prisma.subscription.findFirst({
        where: {
            billingAccountId: attempt.billingAccountId,
            status: client_2.SubscriptionStatus.ACTIVE
        }
    });
    const activeTrial = await client_1.prisma.trialSession.findFirst({
        where: {
            billingAccountId: attempt.billingAccountId,
            status: client_2.TrialStatus.ACTIVE
        }
    });
    const [paymentAttempt, invoice, subscription] = await client_1.prisma.$transaction([
        client_1.prisma.paymentAttempt.update({
            where: { id: attempt.id },
            data: {
                status: client_2.PaymentAttemptStatus.SUCCESS,
                processedAt: now,
                gatewayPaymentId: attempt.gatewayPaymentId || buildMockId('mock_txn')
            }
        }),
        client_1.prisma.invoice.update({
            where: { id: attempt.invoice.id },
            data: {
                status: client_2.InvoiceStatus.PAID,
                paidAt: now
            }
        }),
        client_1.prisma.subscription.create({
            data: {
                billingAccountId: attempt.billingAccountId,
                planType,
                status: client_2.SubscriptionStatus.ACTIVE,
                amountCents: attempt.amountCents,
                currency: attempt.currency,
                startedAt: now,
                currentPeriodStart: now,
                currentPeriodEnd: subscriptionPeriodEnd
            }
        })
    ]);
    if (activeSubscription) {
        await client_1.prisma.subscription.update({
            where: { id: activeSubscription.id },
            data: {
                status: client_2.SubscriptionStatus.CANCELED,
                canceledAt: now
            }
        });
    }
    if (activeTrial) {
        await client_1.prisma.trialSession.update({
            where: { id: activeTrial.id },
            data: {
                status: client_2.TrialStatus.CONVERTED,
                convertedAt: now
            }
        });
    }
    await client_1.prisma.billingAccount.update({
        where: { id: attempt.billingAccountId },
        data: {
            gateway: client_2.BillingGateway.MOCK
        }
    });
    await organizationService.updateOrganizationPlan(attempt.billingAccount.organizationId, {
        planType,
        planStatus: client_2.PlanStatus.ACTIVE,
        durationDays
    });
    return {
        paymentAttempt,
        invoice,
        subscription
    };
};
exports.processMockCallback = processMockCallback;
