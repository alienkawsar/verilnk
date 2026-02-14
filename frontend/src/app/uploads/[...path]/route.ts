import type { NextRequest } from 'next/server';

export const runtime = 'nodejs';

export async function GET(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
    const apiBase = process.env.NEXT_PUBLIC_API_URL?.replace('/api', '') || 'http://localhost:8000';
    const params = await context.params;
    const segments = params.path || [];
    if (segments.length === 0 || segments[0] !== 'flags') {
        return new Response('Not found', { status: 404 });
    }
    const targetUrl = new URL(`/uploads/${segments.join('/')}`, apiBase);

    const upstream = await fetch(targetUrl.toString(), {
        headers: {
            accept: request.headers.get('accept') || '*/*',
        },
    });

    if (!upstream.ok || !upstream.body) {
        return new Response('Not found', { status: upstream.status || 404 });
    }

    const headers = new Headers(upstream.headers);
    if (!headers.get('cache-control')) {
        headers.set('Cache-Control', 'public, max-age=300');
    }

    return new Response(upstream.body, {
        status: upstream.status,
        headers,
    });
}
