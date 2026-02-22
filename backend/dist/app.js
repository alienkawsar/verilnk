"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const compression_1 = __importDefault(require("compression"));
const morgan_1 = __importDefault(require("morgan"));
const rateLimit_middleware_1 = require("./middleware/rateLimit.middleware");
const error_middleware_1 = require("./middleware/error.middleware");
const security_middleware_1 = require("./middleware/security.middleware");
const timeout_middleware_1 = require("./middleware/timeout.middleware");
require("./config/ml.config"); // Load ML Environment Config
const app = (0, express_1.default)();
const STRIPE_WEBHOOK_PATH_PREFIX = '/api/billing/webhooks/stripe';
// Security & Optimization Middleware
app.use((0, helmet_1.default)({
    crossOriginResourcePolicy: { policy: 'cross-origin' }, // Allow resource loading if needed
}));
app.use((0, compression_1.default)({
    filter: (req, res) => {
        if (req.headers['x-no-compression']) {
            return false;
        }
        if (res.getHeader('Content-Type') === 'text/event-stream') {
            return false;
        }
        return compression_1.default.filter(req, res);
    },
}));
app.use((0, morgan_1.default)('combined')); // Structured logging
// Custom Security Middleware (Legacy/Custom)
app.use(security_middleware_1.securityHeaders);
app.use((0, cors_1.default)(security_middleware_1.corsOptions));
app.use(rateLimit_middleware_1.globalRateLimiter);
const cookie_parser_1 = __importDefault(require("cookie-parser"));
app.use(express_1.default.json({
    verify: (req, _res, buffer) => {
        const expressReq = req;
        const url = expressReq.originalUrl || expressReq.url || '';
        if (url.startsWith(STRIPE_WEBHOOK_PATH_PREFIX)) {
            expressReq.rawBody = buffer;
            expressReq.rawBodyText = buffer.toString('utf8');
        }
    },
}));
app.use(express_1.default.urlencoded({ extended: true }));
app.use((0, cookie_parser_1.default)());
app.use((0, timeout_middleware_1.requestTimeout)(20000));
const auth_routes_1 = __importDefault(require("./routes/auth.routes"));
const country_routes_1 = __importDefault(require("./routes/country.routes"));
const category_routes_1 = __importDefault(require("./routes/category.routes"));
const site_routes_1 = __importDefault(require("./routes/site.routes"));
const report_routes_1 = __importDefault(require("./routes/report.routes"));
const search_routes_1 = __importDefault(require("./routes/search.routes"));
const upload_routes_1 = __importDefault(require("./routes/upload.routes"));
const state_routes_1 = __importDefault(require("./routes/state.routes"));
const admin_routes_1 = __importDefault(require("./routes/admin.routes"));
const billing_admin_routes_1 = __importDefault(require("./routes/billing.admin.routes"));
const user_routes_1 = __importDefault(require("./routes/user.routes"));
const saved_site_routes_1 = __importDefault(require("./routes/saved-site.routes"));
const organization_routes_1 = __importDefault(require("./routes/organization.routes"));
const org_link_requests_routes_1 = __importDefault(require("./routes/org.link-requests.routes"));
const request_routes_1 = __importDefault(require("./routes/request.routes"));
const analytics_routes_1 = __importDefault(require("./routes/analytics.routes"));
const audit_routes_1 = __importDefault(require("./routes/audit.routes"));
const compliance_routes_1 = __importDefault(require("./routes/compliance.routes"));
const speech_routes_1 = __importDefault(require("./routes/speech.routes"));
const realtime_routes_1 = __importDefault(require("./routes/realtime.routes"));
const billing_routes_1 = __importDefault(require("./routes/billing.routes"));
const enterprise_api_routes_1 = __importDefault(require("./routes/enterprise.api.routes"));
const enterprise_routes_1 = __importDefault(require("./routes/enterprise.routes"));
const path_1 = __importDefault(require("path"));
const compliance_service_1 = require("./services/compliance.service");
// Serve uploads statically
// Access via /uploads/flags/filename.ext
app.use('/uploads', express_1.default.static(path_1.default.join(process.cwd(), 'uploads')));
app.use('/api/auth', auth_routes_1.default);
console.log('Routes mounted: /api/auth');
app.use('/api/countries', country_routes_1.default);
app.use('/api/categories', category_routes_1.default);
app.use('/api/sites', site_routes_1.default);
app.use('/api/reports', report_routes_1.default);
app.use('/api/v1', search_routes_1.default);
app.use('/api/v1', enterprise_api_routes_1.default); // Enterprise API (read-only, API key auth)
app.use('/api/upload', upload_routes_1.default);
app.use('/api/states', state_routes_1.default);
app.use('/api/admin', admin_routes_1.default);
app.use('/api/admin/billing', billing_admin_routes_1.default);
app.use('/api/admin/audit', audit_routes_1.default);
app.use('/api/admin/compliance', compliance_routes_1.default);
app.use('/api/users/me/saved-sites', saved_site_routes_1.default);
app.use('/api/users', user_routes_1.default);
app.use('/api/organizations', organization_routes_1.default);
app.use('/api/org', org_link_requests_routes_1.default);
app.use('/api/requests', request_routes_1.default);
app.use('/api/analytics', analytics_routes_1.default);
app.use('/api/billing', billing_routes_1.default);
app.use('/api/speech', speech_routes_1.default);
app.use('/api/realtime', realtime_routes_1.default);
app.use('/api/enterprise', enterprise_routes_1.default); // Enterprise dashboard (user auth)
const health_routes_1 = __importDefault(require("./routes/health.routes"));
app.use('/health', health_routes_1.default);
console.log('Routes mounted: /api/speech, /api/realtime, /api/admin/audit, /api/enterprise, /health');
// Optional compliance scheduler (daily)
if (process.env.ENABLE_COMPLIANCE_SCHEDULER === 'true') {
    const adminId = process.env.COMPLIANCE_SYSTEM_ADMIN_ID;
    if (!adminId) {
        console.warn('Compliance scheduler enabled but COMPLIANCE_SYSTEM_ADMIN_ID is missing.');
    }
    else {
        const oneDayMs = 24 * 60 * 60 * 1000;
        setInterval(() => {
            (0, compliance_service_1.runScheduledComplianceJobs)(adminId, 'SUPER_ADMIN').catch((err) => {
                console.error('Compliance scheduled job failed:', err);
            });
        }, oneDayMs);
    }
}
// Initialize Vosk Model (Lazy Loaded via Service)
// initSpeechModel();
app.get('/', (req, res) => {
    res.send('Express server is running');
});
// Error Handling Middleware (must be last)
app.use(error_middleware_1.errorHandler);
exports.default = app;
