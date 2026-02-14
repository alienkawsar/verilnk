import { prisma } from '../db/client';
import { AlertSeverity, BillingGateway, PlanStatus, PlanType, TrialSession, TrialStatus, SubscriptionStatus, SupportTier } from '@prisma/client';
import * as alertService from './alert.service';

const ALLOWED_TRIAL_DURATIONS = [7, 14];
const REMINDER_WINDOW_MS = 2 * 24 * 60 * 60 * 1000;

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
        throw new Error('Only PRO trials are supported');
    }

    if (!ALLOWED_TRIAL_DURATIONS.includes(params.durationDays)) {
        throw new Error('Trial duration must be 7 or 14 days');
    }

    const billingAccount = await ensureBillingAccount(params.organizationId);

    const existingTrial = await prisma.trialSession.findFirst({
        where: { billingAccountId: billingAccount.id },
        orderBy: { createdAt: 'desc' }
    });

    if (existingTrial) {
        throw new Error('Trial already used for this organization');
    }

    const activeSubscription = await prisma.subscription.findFirst({
        where: {
            billingAccountId: billingAccount.id,
            status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING, SubscriptionStatus.PAST_DUE] }
        }
    });

    if (activeSubscription) {
        throw new Error('Active subscription found. Trial not available.');
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
    const active = await getActiveTrialForOrganization(organizationId);
    if (active) return { active: true, trial: active };

    const latest = await prisma.trialSession.findFirst({
        where: { billingAccount: { organizationId } },
        orderBy: { createdAt: 'desc' }
    });

    return { active: false, trial: latest };
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
