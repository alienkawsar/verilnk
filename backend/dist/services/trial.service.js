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
exports.extendTrial = exports.getTrialStatus = exports.startTrial = exports.getActiveTrialForOrganization = exports.TrialServiceError = exports.PRO_TRIAL_DURATION_DAYS = void 0;
const client_1 = require("../db/client");
const client_2 = require("@prisma/client");
const alertService = __importStar(require("./alert.service"));
exports.PRO_TRIAL_DURATION_DAYS = 14;
const REMINDER_WINDOW_MS = 2 * 24 * 60 * 60 * 1000;
class TrialServiceError extends Error {
    constructor(code, message) {
        super(message);
        this.name = 'TrialServiceError';
        this.code = code;
    }
}
exports.TrialServiceError = TrialServiceError;
const ensureBillingAccount = async (organizationId) => {
    return client_1.prisma.billingAccount.upsert({
        where: { organizationId },
        update: {},
        create: {
            organizationId,
            gateway: client_2.BillingGateway.NONE
        }
    });
};
const markTrialExpired = async (trial) => {
    return client_1.prisma.trialSession.update({
        where: { id: trial.id },
        data: { status: client_2.TrialStatus.EXPIRED }
    });
};
const maybeSendReminder = async (trial) => {
    const now = new Date();
    if (trial.endsAt.getTime() - now.getTime() > REMINDER_WINDOW_MS)
        return;
    const metadata = (trial.metadata || {});
    if (metadata.reminderSentAt)
        return;
    await alertService.createAlert(client_2.AlertSeverity.LOW, 'Trial ending soon', `Trial for plan ${trial.planType} ends on ${trial.endsAt.toISOString()}.`);
    await client_1.prisma.trialSession.update({
        where: { id: trial.id },
        data: {
            metadata: {
                ...metadata,
                reminderSentAt: now.toISOString()
            }
        }
    });
};
const getActiveTrialForOrganization = async (organizationId) => {
    const now = new Date();
    const trial = await client_1.prisma.trialSession.findFirst({
        where: {
            status: client_2.TrialStatus.ACTIVE,
            billingAccount: { organizationId }
        },
        orderBy: { endsAt: 'desc' }
    });
    if (!trial)
        return null;
    if (trial.endsAt.getTime() <= now.getTime()) {
        await markTrialExpired(trial);
        await client_1.prisma.organization.update({
            where: { id: organizationId },
            data: {
                planType: client_2.PlanType.FREE,
                planStatus: client_2.PlanStatus.EXPIRED,
                supportTier: client_2.SupportTier.NONE,
                planEndAt: null
            }
        }).catch(() => undefined);
        return null;
    }
    await maybeSendReminder(trial);
    return trial;
};
exports.getActiveTrialForOrganization = getActiveTrialForOrganization;
const startTrial = async (params) => {
    const planType = params.planType ?? client_2.PlanType.PRO;
    if (planType !== client_2.PlanType.PRO) {
        throw new TrialServiceError('TRIAL_PLAN_INVALID', 'Only PRO trials are supported');
    }
    if (params.durationDays !== exports.PRO_TRIAL_DURATION_DAYS) {
        throw new TrialServiceError('TRIAL_DURATION_INVALID', 'Trial duration must be 14 days');
    }
    const billingAccount = await ensureBillingAccount(params.organizationId);
    const existingTrial = await client_1.prisma.trialSession.findFirst({
        where: { billingAccountId: billingAccount.id },
        orderBy: { createdAt: 'desc' }
    });
    if (existingTrial) {
        throw new TrialServiceError('TRIAL_ALREADY_USED', 'Trial already used for this organization');
    }
    const activeSubscription = await client_1.prisma.subscription.findFirst({
        where: {
            billingAccountId: billingAccount.id,
            status: { in: [client_2.SubscriptionStatus.ACTIVE, client_2.SubscriptionStatus.TRIALING, client_2.SubscriptionStatus.PAST_DUE] }
        }
    });
    if (activeSubscription) {
        throw new TrialServiceError('TRIAL_ACTIVE_SUBSCRIPTION', 'Active subscription found. Trial not available.');
    }
    const now = new Date();
    const endsAt = new Date(now);
    endsAt.setDate(endsAt.getDate() + params.durationDays);
    return client_1.prisma.trialSession.create({
        data: {
            billingAccountId: billingAccount.id,
            planType,
            status: client_2.TrialStatus.ACTIVE,
            startedAt: now,
            endsAt,
            durationDays: params.durationDays
        }
    });
};
exports.startTrial = startTrial;
const getTrialStatus = async (organizationId) => {
    const now = new Date();
    const active = await (0, exports.getActiveTrialForOrganization)(organizationId);
    if (active) {
        return {
            active: true,
            source: 'trial_session',
            trial: active,
            trialEndsAt: active.endsAt
        };
    }
    const trialingSubscription = await client_1.prisma.subscription.findFirst({
        where: {
            status: client_2.SubscriptionStatus.TRIALING,
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
    const latest = await client_1.prisma.trialSession.findFirst({
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
exports.getTrialStatus = getTrialStatus;
const extendTrial = async (params) => {
    if (params.extraDays <= 0) {
        throw new Error('Extra days must be greater than zero');
    }
    const billingAccount = await ensureBillingAccount(params.organizationId);
    const trial = await client_1.prisma.trialSession.findFirst({
        where: {
            billingAccountId: billingAccount.id,
            status: client_2.TrialStatus.ACTIVE
        },
        orderBy: { endsAt: 'desc' }
    });
    if (!trial) {
        throw new Error('No active trial found');
    }
    const newEndsAt = new Date(trial.endsAt);
    newEndsAt.setDate(newEndsAt.getDate() + params.extraDays);
    const existingMetadata = (trial.metadata || {});
    return client_1.prisma.trialSession.update({
        where: { id: trial.id },
        data: {
            endsAt: newEndsAt,
            metadata: {
                ...existingMetadata,
                extendedByDays: params.extraDays,
                extendedAt: new Date().toISOString()
            }
        }
    });
};
exports.extendTrial = extendTrial;
