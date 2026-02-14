const axios = require('axios');

async function verifyRoutes() {
    const baseURL = 'http://localhost:3000';
    console.log('--- Verifying Routes on ' + baseURL + ' ---');

    // 1. Test Generic Route
    try {
        console.log('1. GET /api/test');
        const r1 = await axios.get(baseURL + '/api/test');
        console.log('   Success:', r1.status, r1.data);
    } catch (e) {
        console.log('   Failed:', e.response ? e.response.status : e.message);
    }

    // 2. Test Admin Login Route (POST)
    try {
        console.log('2. POST /api/auth/admin/login');
        const r2 = await axios.post(baseURL + '/api/auth/admin/login', { email: 'test', password: 'test' });
        console.log('   Success:', r2.status, r2.data);
    } catch (e) {
        console.log('   Failed:', e.response ? e.response.status : e.message);
    }
}

verifyRoutes();
