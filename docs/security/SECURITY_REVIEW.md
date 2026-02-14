# Security Review (OWASP-aligned)

## 1) Auth & Session
- Cookies are HttpOnly, SameSite=Lax, Secure in production (`backend/src/controllers/auth.controller.ts`).
- JWT token expiry: 24h default, 30d with rememberMe.
- Admin auth uses `admin_token` cookie; user auth uses auth routes (verify in `backend/src/routes/auth.routes.ts`).
- Action: Verify forced logout on password reset in user/admin flows (manual test).

## 2) Input Validation
- Zod used on auth/org/site/admin/billing controllers (`backend/src/controllers/*`).
- Uploads use multer with fileFilter + 1MB limit (`backend/src/middleware/upload.middleware.ts`).
- Fix applied: Multer error handler returns 400 on invalid file types/size (`backend/src/routes/upload.routes.ts`).

## 3) CORS/CSP/Headers
- Backend uses Helmet + Permissions-Policy (microphone allowed) (`backend/src/middleware/security.middleware.ts`).
- CORS restricted to configured frontend origins.
- CSP currently controlled by Next.js middleware/headers (report-only seen in headers). Ensure `frame-src` allows reCAPTCHA domains when enabled.

## 4) Rate Limiting
- Global limiter (1000/15m), strict (50/15m), search (120/min), upload (40/5m), voice (60/10m) (`backend/src/middleware/rateLimit.middleware.ts`).
- Action: Confirm strict limiter applied on auth endpoints; search limiter on `/api/v1/search`; upload limiter on upload routes; voice limiter on speech routes.

## 5) Secrets & Env
- Frontend uses NEXT_PUBLIC_* for public env; backend uses server-only env (JWT_SECRET, RECAPTCHA_SECRET_KEY, etc.).
- Action: Confirm no secrets in frontend bundle.

## 6) Access Control
- Admin routes should enforce roles (SUPER_ADMIN/MODERATOR/VERIFIER) in middleware and route definitions.
- Action: Verify each admin route is gated as intended; audit routes are SUPER_ADMIN only.

## Severity Ratings
- No confirmed critical/high vulnerabilities in this pass. Pending manual verification for auth role checks and CSP iframe allowances.

## Minimal Fix Recommendations (if issues confirmed)
- Add strict auth rate limiter to login endpoints if not already applied.
- Ensure CSP `frame-src` includes reCAPTCHA domains when v3/v2 enabled.
- Ensure any admin password reset invalidates existing sessions (tokenVersion if implemented).
