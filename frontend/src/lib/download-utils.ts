const INVALID_FILENAME_CHARS = /[<>:"/\\|?*\u0000-\u001F]/g;
const WHITESPACE = /\s+/g;

export const formatLocalDateYYYYMMDD = (date: Date = new Date()): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

export const sanitizeDownloadFilename = (value: string | null | undefined, fallback: string): string => {
    const normalized = String(value || '')
        .replace(INVALID_FILENAME_CHARS, ' ')
        .replace(WHITESPACE, ' ')
        .trim();

    if (!normalized) {
        return fallback;
    }

    return normalized.slice(0, 180);
};

const decodeQuotedString = (value: string): string => value
    .trim()
    .replace(/^"(.*)"$/, '$1');

export const getFilenameFromContentDisposition = (contentDisposition: string | null | undefined): string | null => {
    const header = String(contentDisposition || '').trim();
    if (!header) return null;

    const filenameStarMatch = header.match(/filename\*\s*=\s*([^;]+)/i);
    if (filenameStarMatch?.[1]) {
        const encodedValue = decodeQuotedString(filenameStarMatch[1]).replace(/^utf-8''/i, '');
        try {
            return decodeURIComponent(encodedValue);
        } catch {
            return encodedValue;
        }
    }

    const filenameMatch = header.match(/filename\s*=\s*(?:"([^"]+)"|([^;]+))/i);
    const fallbackValue = filenameMatch?.[1] || filenameMatch?.[2];
    if (!fallbackValue) return null;
    return decodeQuotedString(fallbackValue);
};

export const resolveDownloadFilename = (
    contentDisposition: string | null | undefined,
    fallback: string
): string => sanitizeDownloadFilename(
    getFilenameFromContentDisposition(contentDisposition),
    sanitizeDownloadFilename(fallback, 'download')
);

export const triggerBlobDownload = (blob: Blob, filename: string): void => {
    const objectUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(objectUrl);
};
