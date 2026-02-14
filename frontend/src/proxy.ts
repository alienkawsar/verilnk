import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export default function proxy(request: NextRequest) {
    const adminToken = request.cookies.get('admin_token')?.value;
    const isLoginPage = request.nextUrl.pathname === '/admin/login';
    const isAdminRoute = request.nextUrl.pathname.startsWith('/admin');

    // If trying to access admin routes (except login) without admin_token
    if (isAdminRoute && !isLoginPage && !adminToken) {
        return NextResponse.redirect(new URL('/admin/login', request.url));
    }

    // If trying to access login page WITH admin_token, redirect to dashboard
    if (isLoginPage && adminToken) {
        return NextResponse.redirect(new URL('/admin/dashboard', request.url));
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
