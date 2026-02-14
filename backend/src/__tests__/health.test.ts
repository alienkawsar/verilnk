import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../app';

describe('Health endpoint', () => {
    it('responds with 200', async () => {
        const res = await request(app).get('/health');
        expect(res.status).toBe(200);
    });
});

describe('Auth guard', () => {
    it('rejects unauthenticated /api/auth/me', async () => {
        const res = await request(app).get('/api/auth/me');
        expect(res.status).toBe(401);
    });
});
