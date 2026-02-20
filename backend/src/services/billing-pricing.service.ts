import { PlanType } from '@prisma/client';

export type BillingTerm = 'MONTHLY' | 'ANNUAL';

type SelfServePlanType = 'BASIC' | 'PRO' | 'BUSINESS';

const SELF_SERVE_MONTHLY_PRICE_CENTS: Record<SelfServePlanType, number> = {
    BASIC: 4900,
    PRO: 9900,
    BUSINESS: 19900
};

const ANNUAL_DISCOUNT_FACTOR = 0.9;
const DEFAULT_MONTHLY_DURATION_DAYS = 30;
const DEFAULT_ANNUAL_DURATION_DAYS = 365;

const isSelfServePlanType = (planType: PlanType): planType is SelfServePlanType => {
    return planType === PlanType.BASIC || planType === PlanType.PRO || planType === PlanType.BUSINESS;
};

export const toBillingTerm = (value: unknown): BillingTerm | null => {
    if (typeof value !== 'string') return null;
    const normalized = value.trim().toUpperCase();
    if (normalized === 'MONTHLY') return 'MONTHLY';
    if (normalized === 'ANNUAL') return 'ANNUAL';
    return null;
};

export const inferBillingTermFromDurationDays = (durationDays?: number | null): BillingTerm | null => {
    if (typeof durationDays !== 'number' || !Number.isFinite(durationDays)) return null;
    const normalized = Math.max(0, Math.floor(durationDays));
    if (normalized >= 300) return 'ANNUAL';
    if (normalized >= 20) return 'MONTHLY';
    return null;
};

export const billingTermToDurationDays = (billingTerm: BillingTerm): number => {
    return billingTerm === 'ANNUAL' ? DEFAULT_ANNUAL_DURATION_DAYS : DEFAULT_MONTHLY_DURATION_DAYS;
};

export const resolveBillingTerm = (
    billingTerm?: BillingTerm | null,
    durationDays?: number | null
): BillingTerm => {
    return billingTerm || inferBillingTermFromDurationDays(durationDays) || 'MONTHLY';
};

const computeSelfServeAmountCents = (planType: SelfServePlanType, billingTerm: BillingTerm): number => {
    const monthly = SELF_SERVE_MONTHLY_PRICE_CENTS[planType];
    return billingTerm === 'ANNUAL'
        ? Math.round(monthly * 12 * ANNUAL_DISCOUNT_FACTOR)
        : monthly;
};

export const resolvePlanChargeAmountCents = (params: {
    planType: PlanType;
    billingTerm: BillingTerm;
    requestedAmountCents?: number | null;
}): number => {
    const { planType, billingTerm, requestedAmountCents } = params;

    if (planType === PlanType.FREE) {
        throw new Error('FREE plan does not require checkout');
    }

    if (isSelfServePlanType(planType)) {
        const expectedAmount = computeSelfServeAmountCents(planType, billingTerm);
        if (
            requestedAmountCents !== undefined
            && requestedAmountCents !== null
            && requestedAmountCents !== expectedAmount
        ) {
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

