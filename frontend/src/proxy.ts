import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const decodeRoleFromToken = (token?: string): string | null => {
    if (!token) return null;
    try {
        const parts = token.split('.');
        if (parts.length < 2) return null;
        const payload = parts[1];
        const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
        const pad = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
        const decoded = atob(`${normalized}${pad}`);
        const parsed = JSON.parse(decoded) as { role?: string };
        return parsed.role || null;
    } catch {
        return null;
    }
};

export default function proxy(request: NextRequest) {
    const adminToken = request.cookies.get('admin_token')?.value;
    const adminRole = decodeRoleFromToken(adminToken);
    const isLoginPage = request.nextUrl.pathname === '/admin/login';
    const isAdminRoute = request.nextUrl.pathname.startsWith('/admin');

    // If trying to access admin routes (except login) without admin_token
    if (isAdminRoute && !isLoginPage && !adminToken) {
        return NextResponse.redirect(new URL('/admin/login', request.url));
    }

    // If trying to access login page WITH admin_token, redirect to dashboard
    if (isLoginPage && adminToken) {
        if (adminRole === 'ACCOUNTS') {
            return NextResponse.redirect(new URL('/admin/billing', request.url));
        }
        return NextResponse.redirect(new URL('/admin/dashboard', request.url));
    }

    if (
        adminToken
        && adminRole === 'ACCOUNTS'
        && isAdminRoute
        && !request.nextUrl.pathname.startsWith('/admin/billing')
    ) {
        return NextResponse.redirect(new URL('/admin/billing', request.url));
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - uploads (uploaded files)
         * - favicon.ico (favicon file)
         */
        "/((?!_next/static|_next/image|uploads|favicon.ico).*)"
    ],
};
