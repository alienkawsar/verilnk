const axios = require('axios');
const path = require('path');

const BASE_URL = 'http://localhost:8000/api';
const ADMIN_EMAIL = 'admin@verilnk.com';
const ADMIN_PASSWORD = 'ALLAH@is1';

async function verifyLogoUrlUpdate() {
    console.log('--- Verifying External Logo URL Update ---');

    try {
        // 1. Login as Admin
        console.log('1. Logging in as Admin...');
        const loginRes = await axios.post(`${BASE_URL}/auth/admin/login`, {
            email: ADMIN_EMAIL,
            password: ADMIN_PASSWORD
        });
        const token = loginRes.data.token;
        const rawCookies = loginRes.headers['set-cookie'];
        const cookieHeader = rawCookies ? rawCookies.map(c => c.split(';')[0]).join('; ') : '';
        console.log('   Logged in successfully.');

        // 2. Fetch an Organization to Edit
        console.log('2. Fetching Organizations...');
        const orgsRes = await axios.get(`${BASE_URL}/organizations`, {
            headers: { Cookie: cookieHeader }
        });
        const orgs = orgsRes.data;
        if (orgs.length === 0) {
            console.error('   No organizations found. Please create one first.');
            process.exit(1);
        }
        const targetOrg = orgs[0];
        console.log(`   Target Organization: ${targetOrg.name} (${targetOrg.id})`);
        console.log(`   Current Logo: ${targetOrg.logo || 'None'}`);

        // 3. Update Logo with External URL
        const NEW_LOGO_URL = 'https://via.placeholder.com/150.png?text=VeriLnkVerified';
        console.log(`3. Updating Logo to: ${NEW_LOGO_URL}`);

        await axios.patch(`${BASE_URL}/organizations/${targetOrg.id}`, {
            logo: NEW_LOGO_URL
        }, {
            headers: { Cookie: cookieHeader }
        });
        console.log('   Update request sent.');

        // 4. Verify Persistence (Fetch again)
        console.log('4. Verifying Persistence...');
        const verifyRes = await axios.get(`${BASE_URL}/organizations/${targetOrg.id}`, { // Assuming single org fetch works or filter
            headers: { Cookie: cookieHeader }
        });
        // Note: The endpoint might be different depending on routes. 
        // Using GET /organizations with filter or just checking if `verifyRes` is not 404.
        // Actually, backend might not have GET /organizations/:id for admin listing?
        // Let's use the list endpoint again and find it.

        const verifyOrgsRes = await axios.get(`${BASE_URL}/organizations?search=${encodeURIComponent(targetOrg.name)}`, {
            headers: { Cookie: cookieHeader }
        });
        const updatedOrg = verifyOrgsRes.data.find(o => o.id === targetOrg.id);

        if (updatedOrg && updatedOrg.logo === NEW_LOGO_URL) {
            console.log('SUCCESS: Logo URL persisted correctly in DB.');
        } else {
            console.error(`FAILURE: Logo URL not updated. Got: ${updatedOrg ? updatedOrg.logo : 'Org not found'}`);
            process.exit(1);
        }

        // 5. Restore Original (Optional, or just leave it)
        // console.log('5. Restoring original logo (optional clean up)...');
        // await axios.patch(`${BASE_URL}/organizations/${targetOrg.id}`, { logo: targetOrg.logo }, { headers: { Cookie: cookies } });

    } catch (error) {
        console.error('ERROR:', error.message);
        if (error.response) {
            console.error('Response Status:', error.response.status);
            console.error('Response Data:', error.response.data);
        }
        process.exit(1);
    }
}

verifyLogoUrlUpdate();
