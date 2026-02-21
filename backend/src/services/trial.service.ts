import { prisma } from '../db/client';
import { AlertSeverity, BillingGateway, PlanStatus, PlanType, TrialSession, TrialStatus, SubscriptionStatus, SupportTier } from '@prisma/client';
import * as alertService from './alert.service';

export const PRO_TRIAL_DURATION_DAYS = 14;
const REMINDER_WINDOW_MS = 2 * 24 * 60 * 60 * 1000;

export type TrialErrorCode =
    | 'TRIAL_ALREADY_USED'
    | 'TRIAL_DURATION_INVALID'
    | 'TRIAL_PLAN_INVALID'
    | 'TRIAL_ACTIVE_SUBSCRIPTION';

export class TrialServiceError extends Error {
    code: TrialErrorCode;

    constructor(code: TrialErrorCode, message: string) {
        super(message);
        this.name = 'TrialServiceError';
        this.code = code;
    }
}

const ensureBillingAccount = async (organizationId: string) => {
    return prisma.billingAccount.upsert({
        where: { organizationId },
        update: {},
        create: {
            organizationId,
            gateway: BillingGateway.NONE
        }
    });
};

const markTrialExpired = async (trial: TrialSession) => {
    return prisma.trialSession.update({
        where: { id: trial.id },
        data: { status: TrialStatus.EXPIRED }
    });
};

const maybeSendReminder = async (trial: TrialSession) => {
    const now = new Date();
    if (trial.endsAt.getTime() - now.getTime() > REMINDER_WINDOW_MS) return;

    const metadata = (trial.metadata || {}) as Record<string, any>;
    if (metadata.reminderSentAt) return;

    await alertService.createAlert(
        AlertSeverity.LOW,
        'Trial ending soon',
        `Trial for plan ${trial.planType} ends on ${trial.endsAt.toISOString()}.`,
    );

    await prisma.trialSession.update({
        where: { id: trial.id },
        data: {
            metadata: {
                ...metadata,
                reminderSentAt: now.toISOString()
            }
        }
    });
};

export const getActiveTrialForOrganization = async (organizationId: string) => {
    const now = new Date();
    const trial = await prisma.trialSession.findFirst({
        where: {
            status: TrialStatus.ACTIVE,
            billingAccount: { organizationId }
        },
        orderBy: { endsAt: 'desc' }
    });

    if (!trial) return null;

    if (trial.endsAt.getTime() <= now.getTime()) {
        await markTrialExpired(trial);
        await prisma.organization.update({
            where: { id: organizationId },
            data: {
                planType: PlanType.FREE,
                planStatus: PlanStatus.EXPIRED,
                supportTier: SupportTier.NONE,
                planEndAt: null
            }
        }).catch(() => undefined);
        return null;
    }

    await maybeSendReminder(trial);
    return trial;
};

export const startTrial = async (params: {
    organizationId: string;
    durationDays: number;
    planType?: PlanType;
}) => {
    const planType = params.planType ?? PlanType.PRO;

    if (planType !== PlanType.PRO) {
        throw new TrialServiceError('TRIAL_PLAN_INVALID', 'Only PRO trials are supported');
    }

    if (params.durationDays !== PRO_TRIAL_DURATION_DAYS) {
        throw new TrialServiceError('TRIAL_DURATION_INVALID', 'Trial duration must be 14 days');
    }

    const billingAccount = await ensureBillingAccount(params.organizationId);

    const existingTrial = await prisma.trialSession.findFirst({
        where: { billingAccountId: billingAccount.id },
        orderBy: { createdAt: 'desc' }
    });

    if (existingTrial) {
        throw new TrialServiceError('TRIAL_ALREADY_USED', 'Trial already used for this organization');
    }

    const activeSubscription = await prisma.subscription.findFirst({
        where: {
            billingAccountId: billingAccount.id,
            status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING, SubscriptionStatus.PAST_DUE] }
        }
    });

    if (activeSubscription) {
        throw new TrialServiceError('TRIAL_ACTIVE_SUBSCRIPTION', 'Active subscription found. Trial not available.');
    }

    const now = new Date();
    const endsAt = new Date(now);
    endsAt.setDate(endsAt.getDate() + params.durationDays);

    return prisma.trialSession.create({
        data: {
            billingAccountId: billingAccount.id,
            planType,
            status: TrialStatus.ACTIVE,
            startedAt: now,
            endsAt,
            durationDays: params.durationDays
        }
    });
};

export const getTrialStatus = async (organizationId: string) => {
    const now = new Date();
    const active = await getActiveTrialForOrganization(organizationId);
    if (active) {
        return {
            active: true,
            source: 'trial_session',
            trial: active,
            trialEndsAt: active.endsAt
        };
    }

    const trialingSubscription = await prisma.subscription.findFirst({
        where: {
            status: SubscriptionStatus.TRIALING,
            billingAccount: { organizationId }
        },
        orderBy: { trialEndsAt: 'desc' },
        select: {
            id: true,
            status: true,
            planType: true,
            trialEndsAt: true,
            currentPeriodEnd: true
        }
    });

    const subscriptionTrialEndAt = trialingSubscription?.trialEndsAt || trialingSubscription?.currentPeriodEnd || null;
    if (trialingSubscription && subscriptionTrialEndAt && subscriptionTrialEndAt.getTime() > now.getTime()) {
        return {
            active: true,
            source: 'subscription',
            trial: null,
            subscription: trialingSubscription,
            trialEndsAt: subscriptionTrialEndAt
        };
    }

    const latest = await prisma.trialSession.findFirst({
        where: { billingAccount: { organizationId } },
        orderBy: { createdAt: 'desc' }
    });

    return {
        active: false,
        source: 'none',
        trial: latest,
        trialEndsAt: latest?.endsAt || null
    };
};

export const extendTrial = async (params: { organizationId: string; extraDays: number }) => {
    if (params.extraDays <= 0) {
        throw new Error('Extra days must be greater than zero');
    }

    const billingAccount = await ensureBillingAccount(params.organizationId);
    const trial = await prisma.trialSession.findFirst({
        where: {
            billingAccountId: billingAccount.id,
            status: TrialStatus.ACTIVE
        },
        orderBy: { endsAt: 'desc' }
    });

    if (!trial) {
        throw new Error('No active trial found');
    }

    const newEndsAt = new Date(trial.endsAt);
    newEndsAt.setDate(newEndsAt.getDate() + params.extraDays);

    const existingMetadata = (trial.metadata || {}) as Record<string, any>;
    return prisma.trialSession.update({
        where: { id: trial.id },
        data: {
            endsAt: newEndsAt,
            metadata: {
                ...existingMetadata,
                extendedByDays: params.extraDays,
                extendedAt: new Date().toISOString()
            } as any
        }
    });
};
