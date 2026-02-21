"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isEnterpriseManagedSyncedOrganization = exports.computePlanLifecycleState = exports.getPlanGraceDays = void 0;
const client_1 = require("@prisma/client");
const client_2 = require("../db/client");
const PLAN_GRACE_DAYS = {
    [client_1.PlanType.BASIC]: 7,
    [client_1.PlanType.PRO]: 7,
    [client_1.PlanType.BUSINESS]: 7,
    [client_1.PlanType.ENTERPRISE]: 14
};
const ENTERPRISE_SYNC_STATUSES = [
    client_1.EnterpriseOrgLinkRequestStatus.PENDING_APPROVAL,
    client_1.EnterpriseOrgLinkRequestStatus.APPROVED
];
const addDays = (date, days) => {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
};
const getPlanGraceDays = (planType) => {
    return PLAN_GRACE_DAYS[planType] || 0;
};
exports.getPlanGraceDays = getPlanGraceDays;
const computePlanLifecycleState = (params) => {
    const now = params.now || new Date();
    const paidTermEndAt = params.paidTermEndAt || null;
    if (!paidTermEndAt) {
        return {
            paidTermEndAt: null,
            graceDays: 0,
            graceEndsAt: null,
            isInGrace: false,
            isExpired: false
        };
    }
    const graceDays = params.graceSuppressed ? 0 : (0, exports.getPlanGraceDays)(params.planType);
    if (now.getTime() <= paidTermEndAt.getTime()) {
        return {
            paidTermEndAt,
            graceDays,
            graceEndsAt: graceDays > 0 ? addDays(paidTermEndAt, graceDays) : null,
            isInGrace: false,
            isExpired: false
        };
    }
    if (graceDays <= 0) {
        return {
            paidTermEndAt,
            graceDays: 0,
            graceEndsAt: null,
            isInGrace: false,
            isExpired: true
        };
    }
    const graceEndsAt = addDays(paidTermEndAt, graceDays);
    const isInGrace = now.getTime() <= graceEndsAt.getTime();
    return {
        paidTermEndAt,
        graceDays,
        graceEndsAt,
        isInGrace,
        isExpired: !isInGrace
    };
};
exports.computePlanLifecycleState = computePlanLifecycleState;
const isEnterpriseManagedSyncedOrganization = async (organizationId) => {
    if (!organizationId)
        return false;
    const linkRequestModel = client_2.prisma.enterpriseOrgLinkRequest;
    if (!linkRequestModel?.findFirst)
        return false;
    const linkIntent = await linkRequestModel.findFirst({
        where: {
            organizationId,
            intentType: client_1.EnterpriseOrgLinkIntentType.CREATE_UNDER_ENTERPRISE,
            status: {
                in: ENTERPRISE_SYNC_STATUSES
            }
        },
        select: {
            id: true
        }
    });
    return Boolean(linkIntent?.id);
};
exports.isEnterpriseManagedSyncedOrganization = isEnterpriseManagedSyncedOrganization;
