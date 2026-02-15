type BuildInvoiceFilenameInput = {
    organizationName?: string | null;
    organizationId?: string | null;
    invoiceNumber?: string | null;
    invoiceId: string;
    invoiceDate?: Date | null;
};

const sanitizeSlugPart = (value: string | null | undefined): string => {
    if (!value) return '';
    return value
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '');
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
    return value.slice(0, 8).toLowerCase();
};

const normalizeInvoiceToken = (invoiceNumber: string | null | undefined, invoiceId: string): string => {
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

export const buildInvoiceDownloadFilename = (input: BuildInvoiceFilenameInput): string => {
    const organizationSlug = sanitizeSlugPart(input.organizationName)
        || `org-${shortId(input.organizationId || input.invoiceId)}`;
    const invoiceToken = normalizeInvoiceToken(input.invoiceNumber, input.invoiceId);
    const dateToken = formatLocalDate(input.invoiceDate);
    return `${organizationSlug}_${invoiceToken}_${dateToken}.pdf`;
};

export const buildInvoiceContentDisposition = (filename: string): string => {
    const asciiFallback = filename.replace(/[^\x20-\x7E]/g, '');
    const encoded = encodeURIComponent(filename);
    return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
};
