"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildInvoiceFooterWording = exports.resolveInvoiceTaxLine = exports.shouldRenderLatePaymentNotice = exports.resolveInvoiceBillingMode = exports.INVOICE_WORDING_REGISTRY = exports.INVOICE_LANGUAGE_VERSION = void 0;
exports.INVOICE_LANGUAGE_VERSION = 'v1.0';
exports.INVOICE_WORDING_REGISTRY = {
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
};
const normalizeUpper = (value) => String(value || '').trim().toUpperCase();
const CLOSED_INVOICE_STATUSES = new Set(['PAID', 'VOID', 'REFUNDED']);
const SAAS_PLAN_TYPES = new Set(['FREE', 'BASIC', 'PRO', 'BUSINESS']);
const SAAS_GATEWAYS = new Set(['STRIPE', 'SSLCOMMERZ']);
const LOCAL_COUNTRY_CODES = new Set(['BD']);
const resolveInvoiceBillingMode = ({ planType, billingGateway }) => {
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
exports.resolveInvoiceBillingMode = resolveInvoiceBillingMode;
const shouldRenderLatePaymentNotice = ({ status, dueAt, now = new Date() }) => {
    if (!dueAt)
        return false;
    if (!(dueAt instanceof Date) || Number.isNaN(dueAt.getTime()))
        return false;
    const normalizedStatus = normalizeUpper(status);
    if (CLOSED_INVOICE_STATUSES.has(normalizedStatus))
        return false;
    return dueAt.getTime() < now.getTime();
};
exports.shouldRenderLatePaymentNotice = shouldRenderLatePaymentNotice;
const resolveInvoiceTaxLine = ({ taxCents, currency, recipientCountryCode }) => {
    const normalizedCountryCode = normalizeUpper(recipientCountryCode);
    const normalizedCurrency = normalizeUpper(currency);
    const isCrossBorder = (normalizedCountryCode && !LOCAL_COUNTRY_CODES.has(normalizedCountryCode) && normalizedCountryCode !== 'GL')
        || (!normalizedCountryCode && !!normalizedCurrency && normalizedCurrency !== 'BDT');
    if (isCrossBorder) {
        return exports.INVOICE_WORDING_REGISTRY.TAX_CROSS_BORDER;
    }
    if ((taxCents || 0) > 0) {
        return exports.INVOICE_WORDING_REGISTRY.TAX_INCLUDED;
    }
    return exports.INVOICE_WORDING_REGISTRY.TAX_EXCLUDED;
};
exports.resolveInvoiceTaxLine = resolveInvoiceTaxLine;
const buildInvoiceFooterWording = ({ billingMode, status, dueAt, taxCents, currency, recipientCountryCode, notes }) => {
    const lines = [];
    const normalizedNotes = String(notes || '').trim();
    if (normalizedNotes) {
        const noteLines = normalizedNotes
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean);
        lines.push(...noteLines);
    }
    if (billingMode === 'ENTERPRISE') {
        lines.push(exports.INVOICE_WORDING_REGISTRY.PAYMENT_TERMS_NET_15);
    }
    else if (billingMode === 'SAAS') {
        lines.push(exports.INVOICE_WORDING_REGISTRY.PAYMENT_TERMS_DUE_ON_RECEIPT);
        lines.push(exports.INVOICE_WORDING_REGISTRY.SAAS_AUTO_RENEWAL_NOTICE);
    }
    else {
        lines.push(exports.INVOICE_WORDING_REGISTRY.PAYMENT_TERMS_NET_15_UNLESS_STATED);
    }
    lines.push((0, exports.resolveInvoiceTaxLine)({
        taxCents,
        currency,
        recipientCountryCode
    }));
    if ((0, exports.shouldRenderLatePaymentNotice)({ status, dueAt })) {
        lines.push(exports.INVOICE_WORDING_REGISTRY.LATE_PAYMENT_NOTICE);
    }
    lines.push(exports.INVOICE_WORDING_REGISTRY.BILLING_CONTACT, exports.INVOICE_WORDING_REGISTRY.SYSTEM_GENERATED_VALIDITY);
    return {
        lines,
        versionLine: `Invoice language version: ${exports.INVOICE_LANGUAGE_VERSION}`
    };
};
exports.buildInvoiceFooterWording = buildInvoiceFooterWording;
