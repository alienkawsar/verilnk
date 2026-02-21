import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import { globalRateLimiter } from './middleware/rateLimit.middleware';
import { errorHandler } from './middleware/error.middleware';
import { securityHeaders, corsOptions } from './middleware/security.middleware';
import { requestTimeout } from './middleware/timeout.middleware';
import './config/ml.config'; // Load ML Environment Config

const app = express();

// Security & Optimization Middleware
app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" }, // Allow resource loading if needed
}));
app.use(compression({
    filter: (req, res) => {
        if (req.headers['x-no-compression']) {
            return false;
        }
        if (res.getHeader('Content-Type') === 'text/event-stream') {
            return false;
        }
        return compression.filter(req, res);
    }
}));
app.use(morgan('combined')); // Structured logging

// Custom Security Middleware (Legacy/Custom)
app.use(securityHeaders);
app.use(cors(corsOptions));
app.use(globalRateLimiter);

import cookieParser from 'cookie-parser';

app.use(express.json({
    verify: (req, _res, buffer) => {
        if ((req as any).originalUrl?.startsWith('/api/billing/webhooks/stripe')) {
            (req as any).rawBody = buffer.toString('utf8');
        }
    }
}));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(requestTimeout(20000));

import authRoutes from './routes/auth.routes';
import countryRoutes from './routes/country.routes';
import categoryRoutes from './routes/category.routes';
import siteRoutes from './routes/site.routes';
import reportRoutes from './routes/report.routes';
import searchRoutes from './routes/search.routes';
import uploadRoutes from './routes/upload.routes';
import stateRoutes from './routes/state.routes';
import adminRoutes from './routes/admin.routes';
import billingAdminRoutes from './routes/billing.admin.routes';
import userRoutes from './routes/user.routes';
import organizationRoutes from './routes/organization.routes';
import orgLinkRequestRoutes from './routes/org.link-requests.routes';
import requestRoutes from './routes/request.routes';
import analyticsRoutes from './routes/analytics.routes';
import auditRoutes from './routes/audit.routes';
import complianceRoutes from './routes/compliance.routes';
import speechRoutes from './routes/speech.routes';
import realtimeRoutes from './routes/realtime.routes';
import billingRoutes from './routes/billing.routes';
import enterpriseApiRoutes from './routes/enterprise.api.routes';
import enterpriseRoutes from './routes/enterprise.routes';
import { initSpeechModel } from './services/speech.service';
import path from 'path';
import { runScheduledComplianceJobs } from './services/compliance.service';

// Serve uploads statically
// Access via /uploads/flags/filename.ext
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

app.use('/api/auth', authRoutes);
console.log('Routes mounted: /api/auth');
app.use('/api/countries', countryRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/sites', siteRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/v1', searchRoutes);
app.use('/api/v1', enterpriseApiRoutes);  // Enterprise API (read-only, API key auth)
app.use('/api/upload', uploadRoutes);
app.use('/api/states', stateRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin/billing', billingAdminRoutes);
app.use('/api/admin/audit', auditRoutes);
app.use('/api/admin/compliance', complianceRoutes);
app.use('/api/users', userRoutes);
app.use('/api/organizations', organizationRoutes);
app.use('/api/org', orgLinkRequestRoutes);
app.use('/api/requests', requestRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/speech', speechRoutes);
app.use('/api/realtime', realtimeRoutes);
app.use('/api/enterprise', enterpriseRoutes);  // Enterprise dashboard (user auth)
import healthRoutes from './routes/health.routes';
app.use('/health', healthRoutes);
console.log('Routes mounted: /api/speech, /api/realtime, /api/admin/audit, /api/enterprise, /health');

// Optional compliance scheduler (daily)
if (process.env.ENABLE_COMPLIANCE_SCHEDULER === 'true') {
    const adminId = process.env.COMPLIANCE_SYSTEM_ADMIN_ID;
    if (!adminId) {
        console.warn('Compliance scheduler enabled but COMPLIANCE_SYSTEM_ADMIN_ID is missing.');
    } else {
        const oneDayMs = 24 * 60 * 60 * 1000;
        setInterval(() => {
            runScheduledComplianceJobs(adminId, 'SUPER_ADMIN').catch((err) => {
                console.error('Compliance scheduled job failed:', err);
            });
        }, oneDayMs);
    }
}

// Initialize Vosk Model (Lazy Loaded via Service)
// initSpeechModel();

app.get('/', (req: Request, res: Response) => {
    res.send('Express server is running');
});

// Error Handling Middleware (must be last)
app.use(errorHandler);

export default app;
