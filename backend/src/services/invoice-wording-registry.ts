import type { BillingGateway, PlanType } from '@prisma/client';

export const INVOICE_LANGUAGE_VERSION = 'v1.0' as const;

export const INVOICE_WORDING_REGISTRY = {
    PAYMENT_TERMS_NET_15: 'Payment terms: Net 15.',
    PAYMENT_TERMS_DUE_ON_RECEIPT: 'Payment terms: Due upon receipt.',
    PAYMENT_TERMS_NET_15_UNLESS_STATED: 'Payment terms: Net 15 (unless otherwise stated in your agreement).',
    SAAS_AUTO_RENEWAL_NOTICE: 'Payments may be processed automatically for subscription renewals.',
    LATE_PAYMENT_NOTICE: 'For past-due invoices, please contact billing to confirm remittance details.',
    TAX_INCLUDED: 'Applicable taxes are included as shown.',
    TAX_EXCLUDED: 'Taxes, if applicable, are not included unless stated otherwise.',
    TAX_CROSS_BORDER: 'Taxes may be subject to local regulations and are the responsibility of the recipient, where applicable.',
    BILLING_CONTACT: 'For billing inquiries, contact support@verilnk.com.',
    SYSTEM_GENERATED_VALIDITY: 'This invoice is system-generated and valid without signature.'
} as const;

export type InvoiceBillingMode = 'SAAS' | 'ENTERPRISE' | 'UNKNOWN';

type ResolveBillingModeInput = {
    planType?: PlanType | string | null;
    billingGateway?: BillingGateway | string | null;
};

type ResolveTaxLineInput = {
    taxCents?: number | null;
    currency?: string | null;
    recipientCountryCode?: string | null;
};

type ShouldRenderLatePaymentNoticeInput = {
    status?: string | null;
    dueAt?: Date | null;
    now?: Date;
};

type BuildInvoiceFooterWordingInput = {
    billingMode: InvoiceBillingMode;
    status?: string | null;
    dueAt?: Date | null;
    taxCents?: number | null;
    currency?: string | null;
    recipientCountryCode?: string | null;
    notes?: string | null;
};

const normalizeUpper = (value: unknown): string => String(value || '').trim().toUpperCase();

const CLOSED_INVOICE_STATUSES = new Set(['PAID', 'VOID', 'REFUNDED']);
const SAAS_PLAN_TYPES = new Set(['FREE', 'BASIC', 'PRO', 'BUSINESS']);
const SAAS_GATEWAYS = new Set(['STRIPE', 'SSLCOMMERZ']);
const LOCAL_COUNTRY_CODES = new Set(['BD']);

export const resolveInvoiceBillingMode = ({
    planType,
    billingGateway
}: ResolveBillingModeInput): InvoiceBillingMode => {
    const normalizedPlanType = normalizeUpper(planType);
    const normalizedGateway = normalizeUpper(billingGateway);

    if (normalizedPlanType === 'ENTERPRISE') {
        return 'ENTERPRISE';
    }

    if (SAAS_PLAN_TYPES.has(normalizedPlanType) || SAAS_GATEWAYS.has(normalizedGateway)) {
        return 'SAAS';
    }

    return 'UNKNOWN';
};

export const shouldRenderLatePaymentNotice = ({
    status,
    dueAt,
    now = new Date()
}: ShouldRenderLatePaymentNoticeInput): boolean => {
    if (!dueAt) return false;
    if (!(dueAt instanceof Date) || Number.isNaN(dueAt.getTime())) return false;
    const normalizedStatus = normalizeUpper(status);
    if (CLOSED_INVOICE_STATUSES.has(normalizedStatus)) return false;
    return dueAt.getTime() < now.getTime();
};

export const resolveInvoiceTaxLine = ({
    taxCents,
    currency,
    recipientCountryCode
}: ResolveTaxLineInput): string => {
    const normalizedCountryCode = normalizeUpper(recipientCountryCode);
    const normalizedCurrency = normalizeUpper(currency);

    const isCrossBorder =
        (normalizedCountryCode && !LOCAL_COUNTRY_CODES.has(normalizedCountryCode) && normalizedCountryCode !== 'GL')
        || (!normalizedCountryCode && !!normalizedCurrency && normalizedCurrency !== 'BDT');

    if (isCrossBorder) {
        return INVOICE_WORDING_REGISTRY.TAX_CROSS_BORDER;
    }

    if ((taxCents || 0) > 0) {
        return INVOICE_WORDING_REGISTRY.TAX_INCLUDED;
    }

    return INVOICE_WORDING_REGISTRY.TAX_EXCLUDED;
};

export const buildInvoiceFooterWording = ({
    billingMode,
    status,
    dueAt,
    taxCents,
    currency,
    recipientCountryCode,
    notes
}: BuildInvoiceFooterWordingInput): { lines: string[]; versionLine: string } => {
    const lines: string[] = [];

    const normalizedNotes = String(notes || '').trim();
    if (normalizedNotes) {
        const noteLines = normalizedNotes
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean);
        lines.push(...noteLines);
    }

    if (billingMode === 'ENTERPRISE') {
        lines.push(INVOICE_WORDING_REGISTRY.PAYMENT_TERMS_NET_15);
    } else if (billingMode === 'SAAS') {
        lines.push(INVOICE_WORDING_REGISTRY.PAYMENT_TERMS_DUE_ON_RECEIPT);
        lines.push(INVOICE_WORDING_REGISTRY.SAAS_AUTO_RENEWAL_NOTICE);
    } else {
        lines.push(INVOICE_WORDING_REGISTRY.PAYMENT_TERMS_NET_15_UNLESS_STATED);
    }

    lines.push(
        resolveInvoiceTaxLine({
            taxCents,
            currency,
            recipientCountryCode
        })
    );

    if (shouldRenderLatePaymentNotice({ status, dueAt })) {
        lines.push(INVOICE_WORDING_REGISTRY.LATE_PAYMENT_NOTICE);
    }

    lines.push(
        INVOICE_WORDING_REGISTRY.BILLING_CONTACT,
        INVOICE_WORDING_REGISTRY.SYSTEM_GENERATED_VALIDITY
    );

    return {
        lines,
        versionLine: `Invoice language version: ${INVOICE_LANGUAGE_VERSION}`
    };
};
