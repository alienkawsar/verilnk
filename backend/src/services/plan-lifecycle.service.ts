import {
    EnterpriseOrgLinkIntentType,
    EnterpriseOrgLinkRequestStatus,
    PlanType
} from '@prisma/client';
import { prisma } from '../db/client';

const PLAN_GRACE_DAYS: Partial<Record<PlanType, number>> = {
    [PlanType.BASIC]: 7,
    [PlanType.PRO]: 7,
    [PlanType.BUSINESS]: 7,
    [PlanType.ENTERPRISE]: 14
};

const ENTERPRISE_SYNC_STATUSES: EnterpriseOrgLinkRequestStatus[] = [
    EnterpriseOrgLinkRequestStatus.PENDING_APPROVAL,
    EnterpriseOrgLinkRequestStatus.APPROVED
];

const addDays = (date: Date, days: number): Date => {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
};

export interface PlanLifecycleState {
    paidTermEndAt: Date | null;
    graceDays: number;
    graceEndsAt: Date | null;
    isInGrace: boolean;
    isExpired: boolean;
}

export const getPlanGraceDays = (planType: PlanType): number => {
    return PLAN_GRACE_DAYS[planType] || 0;
};

export const computePlanLifecycleState = (params: {
    planType: PlanType;
    paidTermEndAt: Date | null;
    now?: Date;
    graceSuppressed?: boolean;
}): PlanLifecycleState => {
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

    const graceDays = params.graceSuppressed ? 0 : getPlanGraceDays(params.planType);

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

export const isEnterpriseManagedSyncedOrganization = async (organizationId: string): Promise<boolean> => {
    if (!organizationId) return false;

    const linkRequestModel = (prisma as any).enterpriseOrgLinkRequest;
    if (!linkRequestModel?.findFirst) return false;

    const linkIntent = await linkRequestModel.findFirst({
        where: {
            organizationId,
            intentType: EnterpriseOrgLinkIntentType.CREATE_UNDER_ENTERPRISE,
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
