const axios = require('axios');
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');

const jar = new CookieJar();
const client = wrapper(axios.create({
    baseURL: 'http://localhost:3000',
    jar,
    withCredentials: true,
    validateStatus: () => true // Allow all status codes
}));

const CREDENTIALS = {
    email: 'admin@verilnk.com',
    password: 'ALLAH@is1'
};

async function runTests() {
    console.log('--- Starting Proxy Auth Verification ---');

    // 1. Login via Proxy
    console.log('\n[1] Testing Proxy Login (/api/auth/admin/login)...');
    const loginRes = await client.post('/api/auth/admin/login', CREDENTIALS);

    console.log('Status:', loginRes.status);
    console.log('Headers:', loginRes.headers);
    console.log('Body:', loginRes.data);
    if (loginRes.status !== 200) {
        console.error('FAIL: Login failed', loginRes.data);
        process.exit(1);
    }

    const cookies = await jar.getCookies('http://localhost:3000');
    const adminToken = cookies.find(c => c.key === 'admin_token');

    if (!adminToken) {
        console.error('FAIL: admin_token cookie NOT set!');
        process.exit(1);
    }
    console.log('PASS: admin_token cookie set:', adminToken.key);
    console.log('Cookie Path:', adminToken.path);
    console.log('Cookie HttpOnly:', adminToken.httpOnly);


    // 2. Access Admin Dashboard via Next.js
    console.log('\n[2] Testing Admin Dashboard Access (/admin/dashboard)...');

    // Simulate RSC request if possible, or just page load (Next.js middleware runs on page load too)
    // We add a cache buster or _rsc param to be realistic if we knew the hash, but plain GET is enough for middleware check.
    const dashRes = await client.get('/admin/dashboard');

    console.log('Status:', dashRes.status);
    // console.log('Redirect:', dashRes.request.res.responseUrl); // In axios, check for redirects if followRedirects is true (default)

    if (dashRes.status === 200) {
        console.log('PASS: Dashboard returned 200 OK (No Redirect Loop)');
    } else if (dashRes.status === 307 || dashRes.status === 302) {
        // Axios follows redirects by default, so 200 implies we landed somewhere.
        // If we got redirected to login, the final URL would be /admin/login
        const finalUrl = dashRes.request.res.responseUrl;
        if (finalUrl && finalUrl.includes('/admin/login')) {
            console.error('FAIL: Redirected to Login!', finalUrl);
        } else {
            console.log('PASS: Landed on:', finalUrl);
        }
    } else {
        console.warn('WARN: Unexpected status:', dashRes.status);
    }

    // If axios followed redirect to login, dashRes.config.url would effectively be login page
    // Let's explicitly check if we are still authenticated by hitting a protected API route (if any) or just trusting the dashboard load.
    // Dashboard should be protected.


    // 3. Logout
    console.log('\n[3] Testing Logout (/api/auth/admin/logout)...');
    const logoutRes = await client.post('/api/auth/admin/logout');
    console.log('Status:', logoutRes.status);

    const cookiesAfter = await jar.getCookies('http://localhost:3000');
    const adminTokenAfter = cookiesAfter.find(c => c.key === 'admin_token');

    // Cookie should be empty or expired
    if (!adminTokenAfter || adminTokenAfter.value === '') {
        console.log('PASS: admin_token cleared.');
    } else {
        console.error('FAIL: admin_token still exists:', adminTokenAfter);
    }

    // 4. Access Dashboard again
    console.log('\n[4] Re-testing Dashboard (Should Redirect)...');
    const dashRes2 = await client.get('/admin/dashboard', { maxRedirects: 0 }); // Don't follow redirect to see the 307

    console.log('Status:', dashRes2.status);
    if (dashRes2.status === 307 || dashRes2.status === 302) {
        console.log('PASS: correctly redirected (Status: ' + dashRes2.status + ')');
    } else if (dashRes2.status === 200 && dashRes2.request.res.responseUrl.includes('login')) {
        // If redirects followed
        console.log('PASS: Redirected to Login page.');
    } else {
        console.error('FAIL: Should have redirected, got:', dashRes2.status);
    }

    console.log('\n--- Verification Complete ---');
}

runTests().catch(err => console.error(err));
