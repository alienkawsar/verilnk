import { NextResponse } from 'next/server';
import axios from 'axios';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { email, password } = body;

        let API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

        // Remove trailing slash if present
        if (API_URL.endsWith('/')) {
            API_URL = API_URL.slice(0, -1);
        }

        // Handle case where API_URL already includes '/api'
        // Goal: Backend expects /api/auth/admin/login
        let endpoint = '/api/auth/admin/login';

        if (API_URL.endsWith('/api')) {
            // If API_URL is http://locahost:8000/api, we just need /auth/admin/login
            endpoint = '/auth/admin/login';
        }

        const fullUrl = `${API_URL}${endpoint}`;
        // console.log('Proxying to:', fullUrl); // Debug if needed

        const response = await axios.post(fullUrl, {
            email,
            password
        });

        // Check body first
        let { token } = response.data;

        // If not in body, check Set-Cookie headers
        if (!token) {
            // axios response.headers['set-cookie'] is an array of strings
            const setCookieHeaders = response.headers['set-cookie'];

            if (setCookieHeaders && Array.isArray(setCookieHeaders)) {
                const adminTokenCookie = setCookieHeaders.find(c => c.trim().startsWith('admin_token='));
                if (adminTokenCookie) {
                    // Parse value
                    const match = adminTokenCookie.match(/admin_token=([^;]+)/);
                    if (match) {
                        token = match[1];
                    }
                }
            }
        }

        if (!token) {
            return NextResponse.json(
                { message: 'Login successful but no token found in Backend response' },
                { status: 500 }
            );
        }

        const isProd = process.env.NODE_ENV === 'production';

        const nextResponse = NextResponse.json({ ok: true });

        nextResponse.cookies.set({
            name: 'admin_token',
            value: token,
            httpOnly: true,
            path: '/',
            secure: isProd,
            sameSite: 'lax',
            maxAge: 60 * 60 * 24, // 1 day
        });

        return nextResponse;

    } catch (error: any) {
        console.error('Admin Login Proxy Error:', error.response?.data || error.message);
        const status = error.response?.status || 500;
        const message = error.response?.data?.message || 'Internal Server Error';
        return NextResponse.json({ message }, { status });
    }
}
