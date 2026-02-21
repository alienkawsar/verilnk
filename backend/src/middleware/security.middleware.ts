import helmet from 'helmet';
import cors from 'cors';

const helmetMiddleware = helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    hsts: process.env.NODE_ENV === 'production'
        ? { maxAge: 15552000, includeSubDomains: true, preload: true }
        : false,
    referrerPolicy: { policy: 'no-referrer' },
    frameguard: { action: 'deny' }
});

export const securityHeaders = (req: any, res: any, next: any) => {
    res.setHeader('Permissions-Policy', 'camera=(), geolocation=(), microphone=(self), payment=(), usb=()');
    helmetMiddleware(req, res, next);
};

export const corsOptions: cors.CorsOptions = {
    origin: (origin, callback) => {
        const allowedOrigins = [
            process.env.FRONTEND_URL || 'http://localhost:3000',
            'http://localhost:3001',
            'http://127.0.0.1:3000'
        ];
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
        'Content-Type',
        'Authorization',
        'Cache-Control',
        'Pragma',
        'Idempotency-Key',
        'Stripe-Signature',
        'X-Webhook-Signature'
    ],
    exposedHeaders: ['Content-Disposition', 'Content-Length', 'Content-Type'],
    credentials: true,
};
