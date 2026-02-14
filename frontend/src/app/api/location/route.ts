import { NextResponse } from 'next/server';

// Server-side IP detection proxy to avoid CORS issues
// Tries ipwho.is first (reliable CORS), then ipapi.co as fallback
export async function GET(request: Request) {
    try {
        // Extract client IP from headers (set by reverse proxy/CDN in production)
        const forwardedFor = request.headers.get('x-forwarded-for');
        const realIp = request.headers.get('x-real-ip');
        let clientIp = forwardedFor?.split(',')[0]?.trim() || realIp || '';

        // Don't pass loopback/private IPs to providers - they can't geolocate them
        // Let the provider auto-detect using their own method
        const isLoopback = clientIp === '127.0.0.1' || clientIp === '::1' || clientIp === 'localhost' || clientIp.startsWith('192.168.') || clientIp.startsWith('10.');
        if (isLoopback) {
            clientIp = ''; // Let provider auto-detect
        }

        // Try ipwho.is first (no CORS issues, reliable)
        try {
            const ipwhoUrl = clientIp ? `https://ipwho.is/${clientIp}` : 'https://ipwho.is/';
            const res = await fetch(ipwhoUrl, {
                cache: 'no-store',
                headers: { 'Accept': 'application/json' }
            });

            if (res.ok) {
                const data = await res.json();
                if (data.success !== false) {
                    return NextResponse.json({
                        country_code: data.country_code,
                        country_name: data.country,
                        region: data.region,
                        region_code: data.region_code,
                        city: data.city,
                        provider: 'ipwho.is'
                    });
                }
            }
        } catch (e) {
            console.warn('ipwho.is failed, trying fallback...', e);
        }

        // Fallback to ipapi.co (may have rate limits)
        try {
            const ipapiUrl = clientIp ? `https://ipapi.co/${clientIp}/json/` : 'https://ipapi.co/json/';
            const res = await fetch(ipapiUrl, {
                cache: 'no-store',
                headers: { 'Accept': 'application/json' }
            });

            if (res.ok) {
                const data = await res.json();
                if (!data.error) {
                    return NextResponse.json({
                        country_code: data.country_code,
                        country_name: data.country_name,
                        region: data.region,
                        region_code: data.region_code,
                        city: data.city,
                        provider: 'ipapi.co'
                    });
                }
            }
        } catch (e) {
            console.warn('ipapi.co fallback also failed', e);
        }

        // Return null values gracefully if all providers fail
        return NextResponse.json({
            country_code: null,
            country_name: null,
            region: null,
            region_code: null,
            city: null,
            provider: null,
            error: 'All IP detection providers failed'
        }, { status: 200 }); // Still 200 to not break UI

    } catch (error) {
        console.error('Location API error:', error);
        return NextResponse.json({
            country_code: null,
            country_name: null,
            region: null,
            region_code: null,
            city: null,
            provider: null,
            error: 'Internal server error'
        }, { status: 200 });
    }
}
