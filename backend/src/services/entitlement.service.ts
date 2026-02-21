import { prisma } from '../db/client';
import {
    Organization,
    OrgPriority,
    OrgStatus,
    PlanStatus,
    PlanType,
    SupportTier,
    TrialSession,
    TrialStatus
} from '@prisma/client';
import { getActiveTrialForOrganization } from './trial.service';
import { isOrganizationEffectivelyRestricted } from './organization-visibility.service';
import {
    computePlanLifecycleState,
    isEnterpriseManagedSyncedOrganization,
    type PlanLifecycleState
} from './plan-lifecycle.service';

export type AnalyticsLevel = 'NONE' | 'BASIC' | 'ADVANCED' | 'BUSINESS';

export interface OrganizationEntitlements {
    canShowBadge: boolean;
    canAccessOrgPage: boolean;
    analyticsLevel: AnalyticsLevel;
    canExportReports: boolean;
    supportTier: SupportTier;
    priorityLevel: OrgPriority;
    isExpired: boolean;
    isInGrace: boolean;
    graceEndsAt?: Date | null;
    graceDays?: number;
    isTrial: boolean;
    trialEndsAt?: Date | null;
}

const PLAN_SUPPORT_TIER: Record<PlanType, SupportTier> = {
    FREE: 'NONE',
    BASIC: 'EMAIL',
    PRO: 'CHAT',
    BUSINESS: 'INSTANT',
    ENTERPRISE: 'DEDICATED'
};

const PRO_BOOST_DAYS = 30;

const PRIORITY_SCORE: Record<OrgPriority, number> = {
    HIGH: 3,
    MEDIUM: 2,
    NORMAL: 1,
    LOW: 0
};

const scoreToPriority = (score: number): OrgPriority => {
    if (score >= 3) return OrgPriority.HIGH;
    if (score >= 2) return OrgPriority.MEDIUM;
    if (score >= 1) return OrgPriority.NORMAL;
    return OrgPriority.LOW;
};

interface OrganizationPlanLifecycle extends PlanLifecycleState {
    graceSuppressed: boolean;
}

const resolvePlanLifecycleForOrganization = async (
    org: Organization,
    now: Date
): Promise<OrganizationPlanLifecycle> => {
    const graceSuppressed = org.planType !== PlanType.FREE && org.planEndAt
        ? await isEnterpriseManagedSyncedOrganization(org.id)
        : false;

    const lifecycle = computePlanLifecycleState({
        planType: org.planType,
        paidTermEndAt: org.planEndAt || null,
        now,
        graceSuppressed
    });

    return {
        ...lifecycle,
        graceSuppressed
    };
};

const isActivePaidPlan = (org: Organization, lifecycle: PlanLifecycleState) => {
    if (org.planType === PlanType.FREE) return false;
    if (org.planStatus !== PlanStatus.ACTIVE) return false;
    if (lifecycle.isExpired) return false;
    return true;
};

const mapPriorityOverride = (override?: number | null): OrgPriority => {
    if (override === null || override === undefined) return OrgPriority.HIGH;
    if (override >= 3) return OrgPriority.HIGH;
    if (override >= 2) return OrgPriority.MEDIUM;
    if (override >= 1) return OrgPriority.NORMAL;
    return OrgPriority.LOW;
};

const getManualPriorityScore = (org: Organization, now: Date): number => {
    if (org.priorityExpiresAt && org.priorityExpiresAt.getTime() <= now.getTime()) {
        return PRIORITY_SCORE[OrgPriority.NORMAL];
    }
    return PRIORITY_SCORE[org.priority];
};

const computePriorityLevel = (org: Organization, now: Date, isApproved: boolean, activePaid: boolean, trialActive: boolean): OrgPriority => {
    if (!isApproved || org.isRestricted) {
        return OrgPriority.LOW;
    }

    if (trialActive) {
        return OrgPriority.NORMAL;
    }

    if (!activePaid) {
        return OrgPriority.LOW;
    }

    if (org.planType === PlanType.ENTERPRISE) {
        return mapPriorityOverride(org.priorityOverride);
    }

    if (org.planType === PlanType.BUSINESS) {
        return OrgPriority.HIGH;
    }

    if (org.planType === PlanType.PRO) {
        const boostUntil = new Date(org.planStartAt);
        boostUntil.setDate(boostUntil.getDate() + PRO_BOOST_DAYS);
        return now.getTime() <= boostUntil.getTime() ? OrgPriority.HIGH : OrgPriority.NORMAL;
    }

    if (org.planType === PlanType.BASIC) {
        return OrgPriority.NORMAL;
    }

    return OrgPriority.LOW;
};

export const getOrganizationEntitlements = (
    org: Organization,
    trial?: TrialSession | null,
    lifecycle?: PlanLifecycleState
): OrganizationEntitlements => {
    const now = new Date();
    const planLifecycle = lifecycle || computePlanLifecycleState({
        planType: org.planType,
        paidTermEndAt: org.planEndAt || null,
        now
    });
    const trialActive = !!trial && trial.status === TrialStatus.ACTIVE && trial.endsAt.getTime() > now.getTime();
    const activePaid = isActivePaidPlan(org, planLifecycle);
    const isApproved = org.status === OrgStatus.APPROVED;
    const isExpired = org.planStatus === PlanStatus.EXPIRED || planLifecycle.isExpired;
    const effectivePlan = activePaid ? org.planType : (trialActive ? PlanType.PRO : PlanType.FREE);

    const canAccessOrgPage = isApproved && !org.isRestricted && effectivePlan !== PlanType.FREE;
    const canShowBadge = isApproved && !org.isRestricted && activePaid && org.planType !== PlanType.FREE;

    let analyticsLevel: AnalyticsLevel = 'NONE';
    if (isApproved && !org.isRestricted && effectivePlan !== PlanType.FREE) {
        if (effectivePlan === PlanType.BASIC) analyticsLevel = 'BASIC';
        if (effectivePlan === PlanType.PRO) analyticsLevel = 'ADVANCED';
        if (effectivePlan === PlanType.BUSINESS || effectivePlan === PlanType.ENTERPRISE) analyticsLevel = 'BUSINESS';
    }

    let canExportReports = analyticsLevel === 'ADVANCED' || analyticsLevel === 'BUSINESS';
    if (trialActive) {
        canExportReports = false;
    }

    const supportTier = activePaid ? PLAN_SUPPORT_TIER[org.planType] : SupportTier.NONE;

    let priorityLevel = computePriorityLevel(org, now, isApproved, activePaid, trialActive);
    if (!isApproved || org.isRestricted) {
        priorityLevel = OrgPriority.LOW;
    } else if (org.planType === PlanType.ENTERPRISE && activePaid) {
        // Enterprise override is absolute while active.
        priorityLevel = computePriorityLevel(org, now, isApproved, activePaid, trialActive);
    } else {
        const manualPriorityScore = getManualPriorityScore(org, now);
        priorityLevel = scoreToPriority(Math.max(PRIORITY_SCORE[priorityLevel], manualPriorityScore));
    }

    return {
        canShowBadge,
        canAccessOrgPage,
        analyticsLevel,
        canExportReports,
        supportTier,
        priorityLevel,
        isExpired,
        isInGrace: activePaid && planLifecycle.isInGrace,
        graceEndsAt: activePaid && planLifecycle.isInGrace ? planLifecycle.graceEndsAt : null,
        graceDays: activePaid ? planLifecycle.graceDays : 0,
        isTrial: trialActive,
        trialEndsAt: trialActive ? trial?.endsAt : null
    };
};

const applyPlanExpiryIfNeeded = async (
    org: Organization,
    lifecycle: OrganizationPlanLifecycle
): Promise<{ organization: Organization; wasUpdated: boolean }> => {
    const shouldDowngrade = org.planType !== PlanType.FREE && lifecycle.isExpired;
    if (!shouldDowngrade) {
        return { organization: org, wasUpdated: false };
    }

    const updated = await prisma.organization.update({
        where: { id: org.id },
        data: {
            planType: PlanType.FREE,
            planStatus: PlanStatus.EXPIRED,
            supportTier: SupportTier.NONE,
            priorityOverride: null
        }
    });

    return { organization: updated, wasUpdated: true };
};

export const resolveOrganizationEntitlements = async (org: Organization): Promise<{ entitlements: OrganizationEntitlements; organization: Organization; wasUpdated: boolean }> => {
    const now = new Date();
    const lifecycle = await resolvePlanLifecycleForOrganization(org, now);
    const { organization, wasUpdated } = await applyPlanExpiryIfNeeded(org, lifecycle);
    const effectiveRestricted = await isOrganizationEffectivelyRestricted(organization.id);
    const organizationWithEffectiveRestriction = effectiveRestricted && !organization.isRestricted
        ? { ...organization, isRestricted: true }
        : organization;
    const trial = await getActiveTrialForOrganization(organizationWithEffectiveRestriction.id);

    const effectiveLifecycle =
        organizationWithEffectiveRestriction.id === org.id
            && organizationWithEffectiveRestriction.planType === org.planType
            && organizationWithEffectiveRestriction.planEndAt?.getTime() === org.planEndAt?.getTime()
        ? lifecycle
        : computePlanLifecycleState({
            planType: organizationWithEffectiveRestriction.planType,
            paidTermEndAt: organizationWithEffectiveRestriction.planEndAt || null,
            now
        });

    return {
        entitlements: getOrganizationEntitlements(
            organizationWithEffectiveRestriction,
            trial,
            effectiveLifecycle
        ),
        organization: organizationWithEffectiveRestriction,
        wasUpdated: wasUpdated || organizationWithEffectiveRestriction.isRestricted !== organization.isRestricted
    };
};

export const resolveOrganizationEntitlementsById = async (organizationId: string) => {
    const org = await prisma.organization.findUnique({ where: { id: organizationId } });
    if (!org) return null;
    return resolveOrganizationEntitlements(org);
};
