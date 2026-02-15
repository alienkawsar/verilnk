import { NextRequest, NextResponse } from 'next/server';

// Same-origin proxy for backend images to avoid Next.js SSRF protection
// This allows Next/Image to work with backend-hosted images by proxying through same origin

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
const EXPLICIT_ALLOWLIST = (process.env.MEDIA_PROXY_ALLOWLIST || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

// Strict allowlist of permitted paths (security)
const ALLOWED_PATH_PATTERNS = [
    /^\/uploads\/org-logos\/[a-zA-Z0-9_-]+\.(png|jpg|jpeg|gif|webp|svg)$/i,
    /^\/uploads\/flags\/[a-zA-Z0-9_-]+\.(png|jpg|jpeg|gif|webp|svg)$/i,
];

function isAllowedPath(path: string): boolean {
    return ALLOWED_PATH_PATTERNS.some(pattern => pattern.test(path));
}

function isPrivateOrLocalHostname(hostname: string): boolean {
    const normalized = hostname.trim().toLowerCase();

    if (
        normalized === 'localhost'
        || normalized === '127.0.0.1'
        || normalized === '0.0.0.0'
        || normalized === '::1'
    ) {
        return true;
    }

    // Block RFC1918 + link-local + metadata by IPv4 literal
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(normalized)) {
        const parts = normalized.split('.').map((part) => Number(part));
        if (parts.some((part) => Number.isNaN(part) || part < 0 || part > 255)) {
            return true;
        }
        const [a, b] = parts;
        if (
            a === 10
            || (a === 172 && b >= 16 && b <= 31)
            || (a === 192 && b === 168)
            || (a === 169 && b === 254)
            || a === 127
            || (a === 100 && b >= 64 && b <= 127) // carrier-grade NAT
            || normalized === '169.254.169.254' // cloud metadata endpoint
        ) {
            return true;
        }
    }

    return false;
}

function isBackendHostAllowed(backendUrl: URL): boolean {
    const host = backendUrl.hostname.toLowerCase();
    if (EXPLICIT_ALLOWLIST.length > 0) {
        return EXPLICIT_ALLOWLIST.includes(host);
    }

    // Default: allow configured backend host in dev, but avoid private/local in production.
    if (process.env.NODE_ENV === 'production') {
        return !isPrivateOrLocalHostname(host);
    }
    return true;
}

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ path: string[] }> }
) {
    try {
        const resolvedParams = await params;
        const pathSegments = resolvedParams.path;

        if (!pathSegments || pathSegments.length === 0) {
            return new NextResponse('Not found', { status: 404 });
        }

        const parsedBackendUrl = new URL(BACKEND_URL);
        if (!isBackendHostAllowed(parsedBackendUrl)) {
            return new NextResponse('Forbidden', { status: 403 });
        }

        // Reconstruct the path
        const imagePath = '/' + pathSegments.join('/');

        // Security: Only allow specific paths
        if (!isAllowedPath(imagePath)) {
            console.warn('Blocked disallowed image path:', imagePath);
            return new NextResponse('Forbidden', { status: 403 });
        }

        // Fetch from backend
        const backendUrl = `${parsedBackendUrl.origin}${imagePath}`;
        const response = await fetch(backendUrl, {
            cache: 'no-store', // Ensure fresh on first load, but browser will cache via headers
            headers: {
                'Accept': 'image/*',
            },
        });

        if (!response.ok) {
            console.error('Backend image fetch failed:', response.status, backendUrl);
            return new NextResponse('Not found', { status: 404 });
        }

        // Get content type from backend response
        const contentType = response.headers.get('content-type') || 'image/png';
        const imageBuffer = await response.arrayBuffer();

        // Return with appropriate caching headers
        return new NextResponse(imageBuffer, {
            status: 200,
            headers: {
                'Content-Type': contentType,
                'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800', // 1 day cache, 7 day stale
                'X-Content-Type-Options': 'nosniff',
            },
        });
    } catch (error) {
        console.error('Image proxy error:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}
