import { NextRequest, NextResponse } from 'next/server';

// Same-origin proxy for backend images to avoid Next.js SSRF protection
// This allows Next/Image to work with backend-hosted images by proxying through same origin

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

// Strict allowlist of permitted paths (security)
const ALLOWED_PATH_PATTERNS = [
    /^\/uploads\/org-logos\/[a-zA-Z0-9_-]+\.(png|jpg|jpeg|gif|webp|svg)$/i,
    /^\/uploads\/flags\/[a-zA-Z0-9_-]+\.(png|jpg|jpeg|gif|webp|svg)$/i,
];

function isAllowedPath(path: string): boolean {
    return ALLOWED_PATH_PATTERNS.some(pattern => pattern.test(path));
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

        // Reconstruct the path
        const imagePath = '/' + pathSegments.join('/');

        // Security: Only allow specific paths
        if (!isAllowedPath(imagePath)) {
            console.warn('Blocked disallowed image path:', imagePath);
            return new NextResponse('Forbidden', { status: 403 });
        }

        // Fetch from backend
        const backendUrl = `${BACKEND_URL}${imagePath}`;
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
