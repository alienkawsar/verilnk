"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildInvoiceContentDisposition = exports.buildInvoiceDownloadFilename = void 0;
const sanitizeSlugPart = (value) => {
    if (!value)
        return '';
    return value
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '');
};
const formatLocalDate = (value) => {
    const date = value ? new Date(value) : new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};
const shortId = (value) => {
    if (!value)
        return 'unknown';
    return value.slice(0, 8).toLowerCase();
};
const normalizeInvoiceToken = (invoiceNumber, invoiceId) => {
    const raw = (invoiceNumber || '').trim();
    const normalized = raw
        .replace(/^inv[-_\s]*/i, '')
        .replace(/[^a-zA-Z0-9-]/g, '')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '');
    if (normalized.length > 0) {
        return `INV-${normalized.toUpperCase()}`;
    }
    return `INV-${invoiceId.slice(0, 8).toUpperCase()}`;
};
const buildInvoiceDownloadFilename = (input) => {
    const organizationSlug = sanitizeSlugPart(input.organizationName)
        || `org-${shortId(input.organizationId || input.invoiceId)}`;
    const invoiceToken = normalizeInvoiceToken(input.invoiceNumber, input.invoiceId);
    const dateToken = formatLocalDate(input.invoiceDate);
    return `${organizationSlug}_${invoiceToken}_${dateToken}.pdf`;
};
exports.buildInvoiceDownloadFilename = buildInvoiceDownloadFilename;
const buildInvoiceContentDisposition = (filename) => {
    const asciiFallback = filename.replace(/[^\x20-\x7E]/g, '');
    const encoded = encodeURIComponent(filename);
    return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
};
exports.buildInvoiceContentDisposition = buildInvoiceContentDisposition;
