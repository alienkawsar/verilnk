// Utility to convert backend image URLs to same-origin proxy URLs
// This avoids Next.js SSRF protection blocking localhost/private IP images

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

/**
 * Converts a backend image URL to a same-origin proxy URL.
 * This allows Next/Image to work with backend-hosted images.
 * 
 * Examples:
 * - http://localhost:8000/uploads/org-logos/abc.png -> /api/media/uploads/org-logos/abc.png
 * - /uploads/org-logos/abc.png -> /api/media/uploads/org-logos/abc.png
 * - https://external.com/image.png -> https://external.com/image.png (unchanged)
 */
export function toProxyImageUrl(url: string | null | undefined): string {
    if (!url) return '';

    // If it's already a same-origin URL, return as-is
    if (url.startsWith('/api/media/')) {
        return url;
    }

    // Extract path from full backend URL
    if (url.startsWith(BACKEND_URL)) {
        const path = url.substring(BACKEND_URL.length);
        if (path.startsWith('/uploads/')) {
            return `/api/media${path}`;
        }
    }

    // Handle localhost:8000 specifically (common in dev)
    const localhostMatch = url.match(/^https?:\/\/(localhost|127\.0\.0\.1):8000(\/uploads\/.+)$/i);
    if (localhostMatch) {
        return `/api/media${localhostMatch[2]}`;
    }

    // Handle relative /uploads/ paths
    if (url.startsWith('/uploads/')) {
        return `/api/media${url}`;
    }

    // External URLs (https://...) - return as-is for Next/Image remotePatterns
    return url;
}

/**
 * Checks if a URL needs to be proxied through our media API.
 * Returns true for localhost/backend URLs that would trigger SSRF protection.
 */
export function needsProxy(url: string | null | undefined): boolean {
    if (!url) return false;

    // Already proxied
    if (url.startsWith('/api/media/')) return false;

    // Relative uploads
    if (url.startsWith('/uploads/')) return true;

    // Localhost backend URLs
    if (url.includes('localhost:8000') || url.includes('127.0.0.1:8000')) {
        return true;
    }

    return false;
}
