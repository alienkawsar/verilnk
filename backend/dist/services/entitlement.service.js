"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveOrganizationEntitlementsById = exports.resolveOrganizationEntitlements = exports.getOrganizationEntitlements = void 0;
const client_1 = require("../db/client");
const client_2 = require("@prisma/client");
const trial_service_1 = require("./trial.service");
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
const isPlanExpired = (org, now) => {
    return !!org.planEndAt && org.planEndAt.getTime() < now.getTime();
};
const isActivePaidPlan = (org, now) => {
    if (org.planType === client_2.PlanType.FREE)
        return false;
    if (org.planStatus !== client_2.PlanStatus.ACTIVE)
        return false;
    if (org.planEndAt && org.planEndAt.getTime() < now.getTime())
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
const getOrganizationEntitlements = (org, trial) => {
    const now = new Date();
    const trialActive = !!trial && trial.status === client_2.TrialStatus.ACTIVE && trial.endsAt.getTime() > now.getTime();
    const activePaid = isActivePaidPlan(org, now);
    const isApproved = org.status === client_2.OrgStatus.APPROVED;
    const isExpired = org.planStatus === client_2.PlanStatus.EXPIRED || isPlanExpired(org, now);
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
        isTrial: trialActive,
        trialEndsAt: trialActive ? trial?.endsAt : null
    };
};
exports.getOrganizationEntitlements = getOrganizationEntitlements;
const applyPlanExpiryIfNeeded = async (org) => {
    const now = new Date();
    const shouldDowngrade = org.planType !== client_2.PlanType.FREE && isPlanExpired(org, now);
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
    const { organization, wasUpdated } = await applyPlanExpiryIfNeeded(org);
    const trial = await (0, trial_service_1.getActiveTrialForOrganization)(organization.id);
    return {
        entitlements: (0, exports.getOrganizationEntitlements)(organization, trial),
        organization,
        wasUpdated
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
