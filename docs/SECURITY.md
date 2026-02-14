# Security Overview

## Auth & Sessions
- JWT stored in httpOnly cookies.
- Role checks on admin endpoints.
- Admin/org sessions tracked by `AuthSession` and revocable by jti.

## Rate limiting
- Global rate limit.
- Strict limit for auth endpoints.
- Search and upload limits.

## Headers
- Helmet + custom security headers.
- Permissions-Policy restricts sensitive APIs.
- HSTS enabled in production.

## CORS
- Restricted allowed origins via `FRONTEND_URL`.
- Credentials enabled for cookie-based auth.

## File uploads
- Multer storage with 1MB size limit.
- Extension-based filtering for image types.

## Audit & compliance
- Audit logs with hash chain.
- Security events logged for suspicious activity.
