"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolvePlanChargeAmountCents = exports.resolveBillingTerm = exports.billingTermToDurationDays = exports.inferBillingTermFromDurationDays = exports.toBillingTerm = void 0;
const client_1 = require("@prisma/client");
const SELF_SERVE_MONTHLY_PRICE_CENTS = {
    BASIC: 4900,
    PRO: 9900,
    BUSINESS: 19900
};
const ANNUAL_DISCOUNT_FACTOR = 0.9;
const DEFAULT_MONTHLY_DURATION_DAYS = 30;
const DEFAULT_ANNUAL_DURATION_DAYS = 365;
const isSelfServePlanType = (planType) => {
    return planType === client_1.PlanType.BASIC || planType === client_1.PlanType.PRO || planType === client_1.PlanType.BUSINESS;
};
const toBillingTerm = (value) => {
    if (typeof value !== 'string')
        return null;
    const normalized = value.trim().toUpperCase();
    if (normalized === 'MONTHLY')
        return 'MONTHLY';
    if (normalized === 'ANNUAL')
        return 'ANNUAL';
    return null;
};
exports.toBillingTerm = toBillingTerm;
const inferBillingTermFromDurationDays = (durationDays) => {
    if (typeof durationDays !== 'number' || !Number.isFinite(durationDays))
        return null;
    const normalized = Math.max(0, Math.floor(durationDays));
    if (normalized >= 300)
        return 'ANNUAL';
    if (normalized >= 20)
        return 'MONTHLY';
    return null;
};
exports.inferBillingTermFromDurationDays = inferBillingTermFromDurationDays;
const billingTermToDurationDays = (billingTerm) => {
    return billingTerm === 'ANNUAL' ? DEFAULT_ANNUAL_DURATION_DAYS : DEFAULT_MONTHLY_DURATION_DAYS;
};
exports.billingTermToDurationDays = billingTermToDurationDays;
const resolveBillingTerm = (billingTerm, durationDays) => {
    return billingTerm || (0, exports.inferBillingTermFromDurationDays)(durationDays) || 'MONTHLY';
};
exports.resolveBillingTerm = resolveBillingTerm;
const computeSelfServeAmountCents = (planType, billingTerm) => {
    const monthly = SELF_SERVE_MONTHLY_PRICE_CENTS[planType];
    return billingTerm === 'ANNUAL'
        ? Math.round(monthly * 12 * ANNUAL_DISCOUNT_FACTOR)
        : monthly;
};
const resolvePlanChargeAmountCents = (params) => {
    const { planType, billingTerm, requestedAmountCents } = params;
    if (planType === client_1.PlanType.FREE) {
        throw new Error('FREE plan does not require checkout');
    }
    if (isSelfServePlanType(planType)) {
        const expectedAmount = computeSelfServeAmountCents(planType, billingTerm);
        if (requestedAmountCents !== undefined
            && requestedAmountCents !== null
            && requestedAmountCents !== expectedAmount) {
            throw new Error('Amount does not match selected plan pricing');
        }
        return expectedAmount;
    }
    const parsed = Number(requestedAmountCents);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error('Enterprise plan requires a designated amount');
    }
    return Math.max(1, Math.floor(parsed));
};
exports.resolvePlanChargeAmountCents = resolvePlanChargeAmountCents;
