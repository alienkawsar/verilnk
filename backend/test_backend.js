const axios = require('axios');

async function testBackend() {
    try {
        console.log('Testing Backend: http://localhost:8000/api/auth/admin/login');
        const res = await axios.post('http://localhost:8000/api/auth/admin/login', {
            email: 'admin@verilnk.com',
            password: 'wrongpassword' // Expect 400, but NOT 404
        });
        console.log('Success (Unexpected?):', res.status, res.data);
    } catch (err) {
        if (err.response) {
            console.log('Backend Response:', err.response.status, err.response.data);
        } else {
            console.error('Connection Error:', err.message);
        }
    }
}

testBackend();
