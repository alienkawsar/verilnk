"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveOrganizationEntitlementsById = exports.resolveOrganizationEntitlements = exports.getOrganizationEntitlements = void 0;
const client_1 = require("../db/client");
const client_2 = require("@prisma/client");
const trial_service_1 = require("./trial.service");
const organization_visibility_service_1 = require("./organization-visibility.service");
const plan_lifecycle_service_1 = require("./plan-lifecycle.service");
const PLAN_SUPPORT_TIER = {
    FREE: 'NONE',
    BASIC: 'EMAIL',
    PRO: 'CHAT',
    BUSINESS: 'INSTANT',
    ENTERPRISE: 'DEDICATED'
};
const PRO_BOOST_DAYS = 30;
const PRIORITY_SCORE = {
    HIGH: 3,
    MEDIUM: 2,
    NORMAL: 1,
    LOW: 0
};
const scoreToPriority = (score) => {
    if (score >= 3)
        return client_2.OrgPriority.HIGH;
    if (score >= 2)
        return client_2.OrgPriority.MEDIUM;
    if (score >= 1)
        return client_2.OrgPriority.NORMAL;
    return client_2.OrgPriority.LOW;
};
const resolvePlanLifecycleForOrganization = async (org, now) => {
    const graceSuppressed = org.planType !== client_2.PlanType.FREE && org.planEndAt
        ? await (0, plan_lifecycle_service_1.isEnterpriseManagedSyncedOrganization)(org.id)
        : false;
    const lifecycle = (0, plan_lifecycle_service_1.computePlanLifecycleState)({
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
const isActivePaidPlan = (org, lifecycle) => {
    if (org.planType === client_2.PlanType.FREE)
        return false;
    if (org.planStatus !== client_2.PlanStatus.ACTIVE)
        return false;
    if (lifecycle.isExpired)
        return false;
    return true;
};
const mapPriorityOverride = (override) => {
    if (override === null || override === undefined)
        return client_2.OrgPriority.HIGH;
    if (override >= 3)
        return client_2.OrgPriority.HIGH;
    if (override >= 2)
        return client_2.OrgPriority.MEDIUM;
    if (override >= 1)
        return client_2.OrgPriority.NORMAL;
    return client_2.OrgPriority.LOW;
};
const getManualPriorityScore = (org, now) => {
    if (org.priorityExpiresAt && org.priorityExpiresAt.getTime() <= now.getTime()) {
        return PRIORITY_SCORE[client_2.OrgPriority.NORMAL];
    }
    return PRIORITY_SCORE[org.priority];
};
const computePriorityLevel = (org, now, isApproved, activePaid, trialActive) => {
    if (!isApproved || org.isRestricted) {
        return client_2.OrgPriority.LOW;
    }
    if (trialActive) {
        return client_2.OrgPriority.NORMAL;
    }
    if (!activePaid) {
        return client_2.OrgPriority.LOW;
    }
    if (org.planType === client_2.PlanType.ENTERPRISE) {
        return mapPriorityOverride(org.priorityOverride);
    }
    if (org.planType === client_2.PlanType.BUSINESS) {
        return client_2.OrgPriority.HIGH;
    }
    if (org.planType === client_2.PlanType.PRO) {
        const boostUntil = new Date(org.planStartAt);
        boostUntil.setDate(boostUntil.getDate() + PRO_BOOST_DAYS);
        return now.getTime() <= boostUntil.getTime() ? client_2.OrgPriority.HIGH : client_2.OrgPriority.NORMAL;
    }
    if (org.planType === client_2.PlanType.BASIC) {
        return client_2.OrgPriority.NORMAL;
    }
    return client_2.OrgPriority.LOW;
};
const getOrganizationEntitlements = (org, trial, lifecycle) => {
    const now = new Date();
    const planLifecycle = lifecycle || (0, plan_lifecycle_service_1.computePlanLifecycleState)({
        planType: org.planType,
        paidTermEndAt: org.planEndAt || null,
        now
    });
    const trialActive = !!trial && trial.status === client_2.TrialStatus.ACTIVE && trial.endsAt.getTime() > now.getTime();
    const activePaid = isActivePaidPlan(org, planLifecycle);
    const isApproved = org.status === client_2.OrgStatus.APPROVED;
    const isExpired = org.planStatus === client_2.PlanStatus.EXPIRED || planLifecycle.isExpired;
    const effectivePlan = activePaid ? org.planType : (trialActive ? client_2.PlanType.PRO : client_2.PlanType.FREE);
    const canAccessOrgPage = isApproved && !org.isRestricted && effectivePlan !== client_2.PlanType.FREE;
    const canShowBadge = isApproved && !org.isRestricted && activePaid && org.planType !== client_2.PlanType.FREE;
    let analyticsLevel = 'NONE';
    if (isApproved && !org.isRestricted && effectivePlan !== client_2.PlanType.FREE) {
        if (effectivePlan === client_2.PlanType.BASIC)
            analyticsLevel = 'BASIC';
        if (effectivePlan === client_2.PlanType.PRO)
            analyticsLevel = 'ADVANCED';
        if (effectivePlan === client_2.PlanType.BUSINESS || effectivePlan === client_2.PlanType.ENTERPRISE)
            analyticsLevel = 'BUSINESS';
    }
    let canExportReports = analyticsLevel === 'ADVANCED' || analyticsLevel === 'BUSINESS';
    if (trialActive) {
        canExportReports = false;
    }
    const supportTier = activePaid ? PLAN_SUPPORT_TIER[org.planType] : client_2.SupportTier.NONE;
    let priorityLevel = computePriorityLevel(org, now, isApproved, activePaid, trialActive);
    if (!isApproved || org.isRestricted) {
        priorityLevel = client_2.OrgPriority.LOW;
    }
    else if (org.planType === client_2.PlanType.ENTERPRISE && activePaid) {
        // Enterprise override is absolute while active.
        priorityLevel = computePriorityLevel(org, now, isApproved, activePaid, trialActive);
    }
    else {
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
exports.getOrganizationEntitlements = getOrganizationEntitlements;
const applyPlanExpiryIfNeeded = async (org, lifecycle) => {
    const shouldDowngrade = org.planType !== client_2.PlanType.FREE && lifecycle.isExpired;
    if (!shouldDowngrade) {
        return { organization: org, wasUpdated: false };
    }
    const updated = await client_1.prisma.organization.update({
        where: { id: org.id },
        data: {
            planType: client_2.PlanType.FREE,
            planStatus: client_2.PlanStatus.EXPIRED,
            supportTier: client_2.SupportTier.NONE,
            priorityOverride: null
        }
    });
    return { organization: updated, wasUpdated: true };
};
const resolveOrganizationEntitlements = async (org) => {
    const now = new Date();
    const lifecycle = await resolvePlanLifecycleForOrganization(org, now);
    const { organization, wasUpdated } = await applyPlanExpiryIfNeeded(org, lifecycle);
    const effectiveRestricted = await (0, organization_visibility_service_1.isOrganizationEffectivelyRestricted)(organization.id);
    const organizationWithEffectiveRestriction = effectiveRestricted && !organization.isRestricted
        ? { ...organization, isRestricted: true }
        : organization;
    const trial = await (0, trial_service_1.getActiveTrialForOrganization)(organizationWithEffectiveRestriction.id);
    const effectiveLifecycle = organizationWithEffectiveRestriction.id === org.id
        && organizationWithEffectiveRestriction.planType === org.planType
        && organizationWithEffectiveRestriction.planEndAt?.getTime() === org.planEndAt?.getTime()
        ? lifecycle
        : (0, plan_lifecycle_service_1.computePlanLifecycleState)({
            planType: organizationWithEffectiveRestriction.planType,
            paidTermEndAt: organizationWithEffectiveRestriction.planEndAt || null,
            now
        });
    return {
        entitlements: (0, exports.getOrganizationEntitlements)(organizationWithEffectiveRestriction, trial, effectiveLifecycle),
        organization: organizationWithEffectiveRestriction,
        wasUpdated: wasUpdated || organizationWithEffectiveRestriction.isRestricted !== organization.isRestricted
    };
};
exports.resolveOrganizationEntitlements = resolveOrganizationEntitlements;
const resolveOrganizationEntitlementsById = async (organizationId) => {
    const org = await client_1.prisma.organization.findUnique({ where: { id: organizationId } });
    if (!org)
        return null;
    return (0, exports.resolveOrganizationEntitlements)(org);
};
exports.resolveOrganizationEntitlementsById = resolveOrganizationEntitlementsById;
