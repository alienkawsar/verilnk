import { prisma } from '../db/client';
import { BillingGateway, InvoiceStatus, PaymentAttemptStatus, SubscriptionStatus, PlanStatus, PlanType } from '@prisma/client';
import * as auditService from './audit.service';
import { AuditActionType } from '@prisma/client';
import * as organizationService from './organization.service';
import { computeInvoiceIntegrity } from './billing-security.service';

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

export const createManualInvoice = async (params: {
    organizationId: string;
    amountCents: number;
    currency?: string;
    planType: PlanType;
    notes?: string;
    adminId: string;
    durationDays?: number;
}, auditContext?: { ip?: string; userAgent?: string }) => {
    const billingAccount = await ensureBillingAccount(params.organizationId);
    const invoice = await prisma.invoice.create({
        data: {
            billingAccountId: billingAccount.id,
            status: InvoiceStatus.OPEN,
            amountCents: params.amountCents,
            currency: params.currency || 'USD',
            metadata: {
                planType: params.planType,
                durationDays: params.durationDays || null,
                notes: params.notes || null,
                manual: true,
                organizationId: params.organizationId
            } as any,
            integrityHash: computeInvoiceIntegrity({
                organizationId: params.organizationId,
                planType: params.planType,
                amountCents: params.amountCents,
                currency: params.currency || 'USD'
            })
        }
    });

    await auditService.logAction({
        adminId: params.adminId,
        action: AuditActionType.CREATE,
        entity: 'Invoice',
        targetId: invoice.id,
        details: `Created manual invoice for organization ${params.organizationId}`,
        snapshot: invoice,
        ipAddress: auditContext?.ip,
        userAgent: auditContext?.userAgent
    });

    return invoice;
};

export const applyOfflinePayment = async (params: {
    invoiceId: string;
    adminId: string;
}, auditContext?: { ip?: string; userAgent?: string }) => {
    const invoice = await prisma.invoice.findUnique({ where: { id: params.invoiceId }, include: { billingAccount: true } });
    if (!invoice) throw new Error('Invoice not found');

    const updatedInvoice = await prisma.invoice.update({
        where: { id: params.invoiceId },
        data: {
            status: InvoiceStatus.PAID,
            paidAt: new Date()
        }
    });

    await prisma.paymentAttempt.create({
        data: {
            billingAccountId: updatedInvoice.billingAccountId,
            invoiceId: updatedInvoice.id,
            status: PaymentAttemptStatus.SUCCESS,
            amountCents: updatedInvoice.amountCents,
            currency: updatedInvoice.currency,
            gateway: BillingGateway.NONE,
            gatewayPaymentId: `offline_${updatedInvoice.id}`
        }
    });

    const planType = (invoice.metadata as any)?.planType as PlanType | undefined;
    const durationDays = (invoice.metadata as any)?.durationDays as number | undefined;
    if (planType) {
        await organizationService.updateOrganizationPlan(invoice.billingAccount.organizationId, {
            planType,
            planStatus: PlanStatus.ACTIVE,
            durationDays: durationDays || 30
        });
    }

    await auditService.logAction({
        adminId: params.adminId,
        action: AuditActionType.UPDATE,
        entity: 'Invoice',
        targetId: updatedInvoice.id,
        details: 'Applied offline payment',
        snapshot: { before: invoice, after: updatedInvoice },
        ipAddress: auditContext?.ip,
        userAgent: auditContext?.userAgent
    });

    return updatedInvoice;
};

export const cancelSubscription = async (params: { subscriptionId: string; adminId: string }, auditContext?: { ip?: string; userAgent?: string }) => {
    const subscription = await prisma.subscription.findUnique({ where: { id: params.subscriptionId } });
    if (!subscription) throw new Error('Subscription not found');

    const updated = await prisma.subscription.update({
        where: { id: params.subscriptionId },
        data: {
            status: SubscriptionStatus.CANCELED,
            canceledAt: new Date()
        }
    });

    await auditService.logAction({
        adminId: params.adminId,
        action: AuditActionType.UPDATE,
        entity: 'Subscription',
        targetId: updated.id,
        details: 'Canceled subscription',
        snapshot: { before: subscription, after: updated },
        ipAddress: auditContext?.ip,
        userAgent: auditContext?.userAgent
    });

    return updated;
};

export const flagInvoiceRefund = async (params: { invoiceId: string; adminId: string; note?: string }, auditContext?: { ip?: string; userAgent?: string }) => {
    const invoice = await prisma.invoice.findUnique({ where: { id: params.invoiceId } });
    if (!invoice) throw new Error('Invoice not found');

    const metadata = (invoice.metadata || {}) as Record<string, any>;
    const updated = await prisma.invoice.update({
        where: { id: params.invoiceId },
        data: {
            metadata: {
                ...metadata,
                refundFlaggedAt: new Date().toISOString(),
                refundNote: params.note || null,
                refundFlaggedBy: params.adminId
            } as any
        }
    });

    await auditService.logAction({
        adminId: params.adminId,
        action: AuditActionType.UPDATE,
        entity: 'Invoice',
        targetId: updated.id,
        details: 'Flagged invoice for refund review',
        snapshot: { before: invoice, after: updated },
        ipAddress: auditContext?.ip,
        userAgent: auditContext?.userAgent
    });

    return updated;
};
