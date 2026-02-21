"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildInvoiceContentDisposition = exports.buildInvoiceDownloadFilename = void 0;
const sanitizeFilenamePart = (value) => {
    if (!value)
        return '';
    return value
        .normalize('NFKD')
        .replace(/[^\x00-\x7F]/g, '')
        .trim()
        .replace(/[<>:"/\\|?*\u0000-\u001F]+/g, ' ')
        .replace(/\s+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '');
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
    return value.slice(0, 8).toUpperCase();
};
const normalizeInvoiceToken = (invoiceNumber, invoiceId) => {
    const raw = (invoiceNumber || '').trim() || `INV-${invoiceId.slice(0, 8).toUpperCase()}`;
    const normalized = sanitizeFilenamePart(raw)
        .replace(/_/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '');
    return normalized || `INV-${invoiceId.slice(0, 8).toUpperCase()}`;
};
const buildInvoiceDownloadFilename = (input) => {
    const organizationToken = sanitizeFilenamePart(input.organizationName)
        || `Organization-${shortId(input.organizationId || input.invoiceId)}`;
    const invoiceToken = normalizeInvoiceToken(input.invoiceNumber, input.invoiceId);
    const dateToken = formatLocalDate(new Date());
    return `${organizationToken}_Invoice-${invoiceToken}_${dateToken}.pdf`;
};
exports.buildInvoiceDownloadFilename = buildInvoiceDownloadFilename;
const buildInvoiceContentDisposition = (filename) => {
    const asciiFallback = filename.replace(/[^\x20-\x7E]/g, '').replace(/"/g, '') || 'invoice.pdf';
    const encoded = encodeURIComponent(filename);
    return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
};
exports.buildInvoiceContentDisposition = buildInvoiceContentDisposition;
