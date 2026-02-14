const axios = require('axios');

async function verifyAuthSeparation() {
    const baseURL = 'http://localhost:8000/api';

    console.log('--- Verifying Endpoint Existence ---');

    const endpoints = [
        { url: '/auth/admin/me' },
        { url: '/auth/user/me' },
        { url: '/auth/org/me' },
    ];

    for (const ep of endpoints) {
        try {
            console.log(`Checking ${ep.url}...`);
            await axios.get(baseURL + ep.url);
            console.log(`PASS: ${ep.url} reachable (200)`);
        } catch (e) {
            if (e.response) {
                if (e.response.status === 401) {
                    console.log(`PASS: ${ep.url} reachable (401 Auth Required)`);
                } else {
                    console.log(`FAIL: ${ep.url} - Status: ${e.response.status} Data:`, e.response.data);
                }
            } else if (e.request) {
                console.log(`FAIL: ${ep.url} - No Response Received (Server Down/Timeout)`);
            } else {
                console.log(`FAIL: ${ep.url} - Request Error: ${e.message}`);
            }
        }
    }
}

verifyAuthSeparation();
