import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import axios from "axios";

const getTokenMaxAgeSeconds = (token: string, fallbackSeconds: number) => {
    try {
        const payload = token.split('.')[1];
        const json = Buffer.from(payload, 'base64').toString('utf8');
        const data = JSON.parse(json);
        if (data?.exp) {
            const now = Math.floor(Date.now() / 1000);
            const diff = data.exp - now;
            return diff > 0 ? diff : fallbackSeconds;
        }
    } catch {
        // ignore decode errors
    }
    return fallbackSeconds;
};

export async function POST(req: NextRequest) {
    const session = await getServerSession(authOptions);

    if (!session || !session.user || !session.user.email) {
        return NextResponse.json({ message: "Not authenticated" }, { status: 401 });
    }

    try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';

        // Exchange Google Info for VeriLnk Token
        // calling a new backend endpoint
        const backendRes = await axios.post(`${apiUrl}/auth/google`, {
            email: session.user.email,
            firstName: session.user.name?.split(' ')[0] || 'Google',
            lastName: session.user.name?.split(' ').slice(1).join(' ') || 'User',
            photoUrl: session.user.image,
            // We trust NextAuth verified the email via Google
        });

        const { token, user } = backendRes.data;

        // Create the response
        const response = NextResponse.json({ user, message: "Sync successful" });

        // Set the legacy token cookie
        response.cookies.set('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: getTokenMaxAgeSeconds(token, 24 * 60 * 60),
            path: '/'
        });

        return response;

    } catch (error: any) {
        console.error("Sync Error", error.message);
        return NextResponse.json({ message: "Failed to sync user" }, { status: 500 });
    }
}
