type BuildInvoiceFilenameInput = {
    organizationName?: string | null;
    organizationId?: string | null;
    invoiceNumber?: string | null;
    invoiceId: string;
    invoiceDate?: Date | null;
};

const sanitizeFilenamePart = (value: string | null | undefined): string => {
    if (!value) return '';
    return value
        .normalize('NFKD')
        .replace(/[^\x00-\x7F]/g, '')
        .trim()
        .replace(/[<>:"/\\|?*\u0000-\u001F]+/g, ' ')
        .replace(/\s+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '');
};

const formatLocalDate = (value?: Date | null): string => {
    const date = value ? new Date(value) : new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const shortId = (value: string | null | undefined): string => {
    if (!value) return 'unknown';
    return value.slice(0, 8).toUpperCase();
};

const normalizeInvoiceToken = (invoiceNumber: string | null | undefined, invoiceId: string): string => {
    const raw = (invoiceNumber || '').trim() || `INV-${invoiceId.slice(0, 8).toUpperCase()}`;
    const normalized = sanitizeFilenamePart(raw)
        .replace(/_/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '');
    return normalized || `INV-${invoiceId.slice(0, 8).toUpperCase()}`;
};

export const buildInvoiceDownloadFilename = (input: BuildInvoiceFilenameInput): string => {
    const organizationToken = sanitizeFilenamePart(input.organizationName)
        || `Organization-${shortId(input.organizationId || input.invoiceId)}`;
    const invoiceToken = normalizeInvoiceToken(input.invoiceNumber, input.invoiceId);
    const dateToken = formatLocalDate(new Date());
    return `${organizationToken}_Invoice-${invoiceToken}_${dateToken}.pdf`;
};

export const buildInvoiceContentDisposition = (filename: string): string => {
    const asciiFallback = filename.replace(/[^\x20-\x7E]/g, '').replace(/"/g, '') || 'invoice.pdf';
    const encoded = encodeURIComponent(filename);
    return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
};
