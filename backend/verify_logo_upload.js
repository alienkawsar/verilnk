const axios = require('axios');
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');
const FormData = require('form-data');
const fs = require('fs');

const jar = new CookieJar();
const client = wrapper(axios.create({
    baseURL: 'http://localhost:3000',
    jar,
    withCredentials: true,
    validateStatus: () => true
}));

const CREDENTIALS = {
    email: 'admin@verilnk.com',
    password: 'ALLAH@is1'
};

async function runTests() {
    console.log('--- Verifying Org Logo Upload for Admin ---');

    console.log('\n[1] Logging in as Admin...');
    const loginRes = await client.post('/api/auth/admin/login', CREDENTIALS);
    if (loginRes.status !== 200) {
        console.error('FAIL: Login failed', loginRes.status, loginRes.data);
        process.exit(1);
    }
    console.log('PASS: Login successful');

    console.log('\n[2] Uploading Logo to /api/upload/org-logo...');

    // Create a dummy image file if not exists
    if (!fs.existsSync('test_logo.png')) {
        // Create a minimal valid PNG
        const pngBuffer = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
        fs.writeFileSync('test_logo.png', pngBuffer);
    }

    const form = new FormData();
    form.append('file', fs.createReadStream('test_logo.png'));

    // Note: Use the underlying axios instance or set headers for form-data
    const uploadRes = await client.post('http://localhost:8000/api/upload/org-logo', form, {
        headers: {
            ...form.getHeaders()
        }
    });

    console.log('Status:', uploadRes.status);
    console.log('Body:', uploadRes.data);

    if (uploadRes.status === 200 && uploadRes.data.url) {
        console.log('PASS: Upload successful!');
        console.log('URL:', uploadRes.data.url);
    } else {
        console.error('FAIL: Upload failed');
        process.exit(1);
    }
}

runTests().catch(err => console.error(err));
