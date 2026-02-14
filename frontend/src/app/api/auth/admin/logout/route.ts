import { NextResponse } from 'next/server';

export async function POST() {
    const isProd = process.env.NODE_ENV === 'production';

    const nextResponse = NextResponse.json({ ok: true });

    nextResponse.cookies.set({
        name: 'admin_token',
        value: '',
        httpOnly: true,
        path: '/',
        secure: isProd,
        sameSite: 'lax',
        maxAge: 0,
    });

    return nextResponse;
}
