# VeriLnk Architecture

## High-level
- Frontend: Next.js 16 (App Router) for public pages, dashboards, and admin UI.
- Backend: Express + Prisma for API, auth, admin operations, uploads, and analytics.
- Search: MeiliSearch for public directory and search results.
- Storage: PostgreSQL via Prisma; file uploads stored locally under `/uploads`.

## Core services
- Auth: JWT (httpOnly cookie) for users, orgs, and admins.
- Sessions: `AuthSession` for admin/org session tracking and revocation.
- Security events: `SecurityEvent` for suspicious login and failed login bursts.
- Audit logs: append-only, chained hash for tamper resistance.
- Bulk import: CSV/JSON job pipeline with validation and MeiliSearch sync.

## Data flow (public search)
1) Client search query and filters (country/state/category).
2) Backend `/api/v1/search` performs MeiliSearch query.
3) Results return with org linkage data for Verified Profile buttons.
4) Analytics logged asynchronously.

## Data flow (homepage directory)
1) Client requests paginated sites via `/api/sites`.
2) Backend resolves org entitlements + public visibility.
3) Frontend renders shared SiteCard with Verified Profile + Official Website actions.

## Admin flows
- Admin login (`/api/auth/admin/login`) issues JWT + session.
- Admin dashboard sections call `/api/admin/*` with role enforcement.
- Updates that affect search trigger MeiliSearch reindex/partial update.

## Background jobs
- Optional compliance scheduler (daily) for audit integrity and retention checks.
 - Enabled via `ENABLE_COMPLIANCE_SCHEDULER=true`.
